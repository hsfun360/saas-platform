// Account Receivable - periodic processing: the staged interest run
// (/ar/interest menu) and the statement run (/ar/statements menu).
//
// Interest: generate -> holding headers (one per debtor per month) -> review
// -> confirm (posts the summary Debit Note under the auto-seeded INTEREST
// transaction type) or cancel. Statements: generate for a period -> frozen
// Statement + lines with the party snapshot.

const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const Debtor = require('./debtor.model');
const OtherDebtor = require('./otherDebtor.model');
const InterestGeneration = require('./interestGeneration.model');
const InterestGenerationDetail = require('./interestGenerationDetail.model');
const Statement = require('./statement.model');
const StatementDetail = require('./statementDetail.model');
const StatementRun = require('./statementRun.model');
const posting = require('./arPosting.service');
const { generateInterest } = require('./arInterest.service');
const arStatement = require('./arStatement.service');
const { getUserContext, getCallerPlacement } = require('../../platform/serviceContext');
const membershipGateway = require('../../platform/membershipGateway');
const numberingGateway = require('../../platform/numberingGateway');
const { quoteTax } = require('../../platform/taxGateway');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

function str(x) { return typeof x === 'string' ? x.trim() : ''; }

function ownershipStamps(req, placement) {
    const callerId = getUserContext(req).userId;
    return { createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId };
}

function monthLabel(periodMonth) {
    const [y, m] = String(periodMonth).split('-').map(Number);
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${names[m - 1]} ${y}`;
}

// Batch-resolve debtor display (no/name) for run listings.
async function debtorDisplayMap(companyId, debtorIds) {
    const debtors = await Debtor.findAll({ where: { companyId, id: { [Op.in]: debtorIds } } });
    const ids = { membershipIds: [], memberIds: [], otherIds: [] };
    for (const d of debtors) {
        if (d.debtorType === 'membership') ids.membershipIds.push(d.sourceId);
        else if (d.debtorType === 'member') ids.memberIds.push(d.sourceId);
        else ids.otherIds.push(d.sourceId);
    }
    const display = await membershipGateway.lookupPartyDisplay(companyId, ids);
    const others = ids.otherIds.length
        ? await OtherDebtor.findAll({ where: { id: { [Op.in]: ids.otherIds } }, attributes: ['id', 'code', 'name'] })
        : [];
    const otherById = new Map(others.map((o) => [o.id, o]));
    const out = new Map();
    for (const d of debtors) {
        let no = null; let name = null;
        if (d.debtorType === 'membership') { const m = display.memberships[d.sourceId]; if (m) { no = m.no; name = m.name; } }
        else if (d.debtorType === 'member') { const m = display.members[d.sourceId]; if (m) { no = m.no; name = m.name; } }
        else { const o = otherById.get(d.sourceId); if (o) { no = o.code; name = o.name; } }
        out.set(d.id, { debtorType: d.debtorType, no, name });
    }
    return out;
}

// ---------------------------------------------------------------------------
// Interest run

// POST /api/ar/interest-generations { month: 'YYYY-MM', cutoffDate,
// ratePercent, graceDays } - generate holding headers for the month.
exports.generate = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const month = str(req.body.month);
        if (!MONTH_RE.test(month)) return res.status(400).json({ message: 'Month is required (YYYY-MM).' });
        const cutoffDate = str(req.body.cutoffDate);
        if (!DATE_RE.test(cutoffDate)) return res.status(400).json({ message: 'Cutoff date is required (YYYY-MM-DD).' });
        const rate = Number(req.body.ratePercent);
        if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
            return res.status(400).json({ message: 'Interest rate must be a percentage greater than zero.' });
        }
        const graceDays = Number(req.body.graceDays);
        if (!Number.isInteger(graceDays) || graceDays < 0 || graceDays > 365) {
            return res.status(400).json({ message: 'Grace days must be between 0 and 365.' });
        }

        const placement = await getCallerPlacement(req);
        const stamps = ownershipStamps(req, placement);
        const result = await generateInterest({
            companyId,
            periodMonth: `${month}-01`,
            cutoffDate,
            ratePercent: rate,
            graceDays,
            stamps,
        });
        res.status(200).json({
            message: `Interest generated for ${result.generated} debtor(s) - total ${result.totalInterest}. `
                + `${result.skippedExisting} debtor(s) already had a run this month.`,
            ...result,
        });
    } catch (err) {
        console.error('Error generating interest:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/ar/interest-generations?month=YYYY-MM - the review list.
exports.list = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const month = str(req.query.month);
        const where = { companyId };
        if (MONTH_RE.test(month)) where.periodMonth = `${month}-01`;

        const rows = await InterestGeneration.findAll({
            where,
            order: [['periodMonth', 'DESC'], ['createdAt', 'ASC']],
            limit: 300,
        });
        const display = rows.length ? await debtorDisplayMap(companyId, [...new Set(rows.map((r) => r.debtorId))]) : new Map();
        res.status(200).json({
            generations: rows.map((r) => ({
                id: r.id,
                debtorId: r.debtorId,
                debtor: display.get(r.debtorId) || null,
                periodMonth: r.periodMonth,
                cutoffDate: r.cutoffDate,
                interestRate: r.interestRate,
                graceDays: r.graceDays,
                totalOverdue: r.totalOverdue,
                interestAmount: r.interestAmount,
                status: r.status,
                postedLedgerId: r.postedLedgerId,
            })),
        });
    } catch (err) {
        console.error('Error listing interest generations:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/ar/interest-generations/:id - header + the detail drill-down.
exports.get = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await InterestGeneration.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Interest generation not found.' });
        const details = await InterestGenerationDetail.findAll({
            where: { interestGenerationId: row.id },
            order: [['dueDate', 'ASC']],
        });
        const display = await debtorDisplayMap(companyId, [row.debtorId]);
        res.status(200).json({ generation: { ...row.toJSON(), debtor: display.get(row.debtorId) || null }, details });
    } catch (err) {
        console.error('Error loading interest generation:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Confirm ONE header: post the summary Debit Note (INTEREST transaction type,
// tax per that catalog row) and stamp postedLedgerId. Shared by the single and
// bulk endpoints.
async function confirmOne(req, companyId, id, interestType, stamps) {
    const gen = await InterestGeneration.findOne({ where: { id, companyId } });
    if (!gen) return { id, ok: false, message: 'Not found.' };
    if (gen.status !== 'pending') return { id, ok: false, message: `Already ${gen.status}.` };
    const debtor = await Debtor.findOne({ where: { id: gen.debtorId, companyId } });
    if (!debtor) return { id, ok: false, message: 'Debtor not found.' };

    const amountC = posting.cents(gen.interestAmount);
    let amounts = { netC: amountC, taxC: 0, grossC: amountC, taxSchemeCode: null, taxRate: null };
    if (interestType.taxSchemeCode) {
        const q = await quoteTax(req, { taxSchemeCode: interestType.taxSchemeCode, amount: amountC / 100, onDate: gen.cutoffDate });
        if (!q) return { id, ok: false, message: `Tax scheme '${interestType.taxSchemeCode}' could not be resolved.` };
        amounts = {
            netC: posting.cents(q.net),
            taxC: posting.cents(q.taxTotal),
            grossC: posting.cents(q.gross),
            taxSchemeCode: interestType.taxSchemeCode,
            taxRate: q.lines.reduce((s, l) => s + Number(l.taxRate || 0), 0).toFixed(4),
        };
    }

    const issueDocNo = async (t) => {
        // Interest documents number under their OWN series (ar-interest,
        // added 2026-08-20 to sync numbering with the transaction classes) -
        // no longer borrowed from the Debit Note series.
        const issued = await numberingGateway.issueNumber(req, 'ar-interest', { transaction: t });
        if (issued && issued.number) return issued.number;
        // Synthetic fallback: bulk confirms can land in the same millisecond,
        // so suffix with the generation id to stay unique.
        return `INT-${Date.now().toString(36).toUpperCase()}-${gen.id.slice(0, 4).toUpperCase()}`;
    };

    try {
        const dn = await sequelize.transaction(async (t) => {
            const row = await posting.postLedgerDoc({
                companyId,
                debtor,
                docKind: 'debit-note',
                issueDocNo,
                docDate: gen.cutoffDate,
                trxDate: gen.cutoffDate,
                transactionTypeId: interestType.id,
                isInterestChargeable: interestType.isInterestChargeable === true,
                description: `Interest for ${monthLabel(gen.periodMonth)}`,
                sourceModule: 'ar',
                sourceRef: gen.id,
                amounts,
                stamps,
                t,
            });
            gen.status = 'confirmed';
            gen.postedLedgerId = row.id;
            gen.updatedBy = stamps.updatedBy;
            await gen.save({ transaction: t });
            return row;
        });
        return { id, ok: true, message: `Posted ${dn.docNo}.`, docNo: dn.docNo };
    } catch (e) {
        if (e && e.httpStatus) return { id, ok: false, message: e.message };
        throw e;
    }
}

// POST /api/ar/interest-generations/confirm { ids: [...] } - selective/bulk
// confirm; per-id results so the screen reports posted vs failed concretely.
exports.confirm = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const ids = Array.isArray(req.body.ids) ? req.body.ids.filter((x) => typeof x === 'string') : [];
        if (!ids.length) return res.status(400).json({ message: 'Select at least one generation to confirm.' });

        const interestType = await require('./catalogDefaults').interestType(companyId);
        const placement = await getCallerPlacement(req);
        const stamps = ownershipStamps(req, placement);

        const results = [];
        for (const id of ids) {
            results.push(await confirmOne(req, companyId, id, interestType, stamps));
        }
        const posted = results.filter((r) => r.ok).length;
        res.status(200).json({
            message: `${posted} interest Debit Note(s) posted${posted < results.length ? `, ${results.length - posted} failed` : ''}.`,
            results,
        });
    } catch (err) {
        console.error('Error confirming interest generations:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/ar/interest-generations/:id/cancel - discard a pending header
// (regeneration for the month becomes possible again).
exports.cancel = async (req, res) => {
    try {
        const { companyId, userId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const gen = await InterestGeneration.findOne({ where: { id: req.params.id, companyId } });
        if (!gen) return res.status(404).json({ message: 'Interest generation not found.' });
        if (gen.status !== 'pending') return res.status(400).json({ message: `This generation is already ${gen.status}.` });
        gen.status = 'cancelled';
        gen.updatedBy = userId;
        await gen.save();
        res.status(200).json({ message: 'Interest generation cancelled.' });
    } catch (err) {
        console.error('Error cancelling interest generation:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---------------------------------------------------------------------------
// AR Setting (statement cutoff day + aging boundaries) - Generation screen.

function settingJson(row) {
    return {
        statementCutoffDay: row.statementCutoffDay,
        aging1: row.aging1, aging2: row.aging2, aging3: row.aging3,
        aging4: row.aging4, aging5: row.aging5, aging6: row.aging6,
        statementShowLogo: row.statementShowLogo,
        statementBrandColor: row.statementBrandColor,
        statementShowAging: row.statementShowAging,
        statementShowDeposit: row.statementShowDeposit,
        statementShowIncurredBy: row.statementShowIncurredBy,
        statementShowGeneratedNote: row.statementShowGeneratedNote,
        statementFooterText: row.statementFooterText,
        statementColumns: row.statementColumns,
        membershipIntegration: row.membershipIntegration === true,
        interestTransactionTypeId: row.interestTransactionTypeId,
        depositConversionTransactionTypeId: row.depositConversionTransactionTypeId,
        multiCurrencyEnabled: row.multiCurrencyEnabled === true,
        fxGainTransactionTypeId: row.fxGainTransactionTypeId,
        fxLossTransactionTypeId: row.fxLossTransactionTypeId,
    };
}

// GET /api/ar/settings
exports.getArSetting = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await arStatement.getSetting(companyId);
        // Entitlement trims the Membership-integration card for AR-only
        // subscribers; the designated-type pickers get their class options.
        const { companyHasModule, getCompanyBaseCurrency } = require('../../platform/serviceContext');
        const ArTransactionType = require('./transactionType.model');
        const designatedOptions = (trxClass) => ArTransactionType.findAll({
            where: { companyId, trxClass, isActive: true },
            order: [['transactionType', 'ASC']],
            attributes: ['id', 'transactionType', 'description'],
        });
        const [interestOptions, cnOptions, forexOptions, baseCurrencyCode] = await Promise.all([
            designatedOptions('interest'),
            designatedOptions('credit-note'),
            designatedOptions('forex'),
            getCompanyBaseCurrency(companyId),
        ]);
        res.status(200).json({
            setting: settingJson(row),
            membershipModuleEntitled: await companyHasModule(companyId, 'Membership Management'),
            interestTypeOptions: interestOptions.map((t) => t.toJSON()),
            depositConversionTypeOptions: cnOptions.map((t) => t.toJSON()),
            // Multi-currency card: the AR base currency (null = the prerequisite
            // is missing, the toggle stays off) + Forex-class designations.
            baseCurrencyCode,
            forexTypeOptions: forexOptions.map((t) => t.toJSON()),
        });
    } catch (err) {
        console.error('Error loading AR setting:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/ar/settings { statementCutoffDay, aging1..aging6, statement* layout }
exports.saveArSetting = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const placement = await getCallerPlacement(req);
        const row = await arStatement.saveSetting(companyId, req.body || {}, ownershipStamps(req, placement));
        res.status(200).json({ message: 'AR settings saved.', setting: settingJson(row) });
    } catch (err) {
        if (err && err.httpStatus) return res.status(err.httpStatus).json({ message: err.message });
        console.error('Error saving AR setting:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/ar/settings/statement-preview - the SAVED layout options rendered
// on a dummy statement (show-expected-results for the AR Specification
// screen; touches no real debtor data).
exports.getStatementLayoutPreview = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const setting = await arStatement.getSetting(companyId);
        const { getCompanyLetterhead } = require('../../platform/serviceContext');
        const letterhead = await getCompanyLetterhead(companyId);
        const { renderStatementPdf, sampleStatement } = require('./arStatementPdf');
        const sample = sampleStatement({
            companyName: letterhead && letterhead.name,
            companyAddress: letterhead && letterhead.address,
            boundaries: arStatement.boundariesOf(setting),
        });
        const layout = arStatement.statementLayoutOf(setting, letterhead ? letterhead.logo : null);
        const pdf = await renderStatementPdf(sample.statement, sample.details, layout);
        res.status(200)
            .set({
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'inline; filename="Statement-layout-preview.pdf"',
                'Content-Length': pdf.length,
            })
            .send(pdf);
    } catch (err) {
        console.error('Error rendering statement layout preview:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---------------------------------------------------------------------------
// Statement runs (Generation screen) - preview, start, chunked process, list.

// Parse + validate the shared run parameters. Dates default from the cutoff
// rule when omitted.
async function readRunParams(req, companyId) {
    const month = str(req.body.month);
    if (!MONTH_RE.test(month)) throw Object.assign(new Error('Statement month is required (YYYY-MM).'), { httpStatus: 400 });
    const setting = await arStatement.getSetting(companyId);
    const dflt = arStatement.defaultPeriod(month, setting.statementCutoffDay);
    const periodStart = str(req.body.periodStart) || dflt.periodStart;
    const periodEnd = str(req.body.periodEnd) || dflt.periodEnd;
    if (!DATE_RE.test(periodStart) || !DATE_RE.test(periodEnd) || periodEnd < periodStart) {
        throw Object.assign(new Error('A valid date range (from and to) is required.'), { httpStatus: 400 });
    }
    const categories = arStatement.validCategories(req.body.categories);
    if (!categories.length) throw Object.assign(new Error('Select at least one debtor category.'), { httpStatus: 400 });
    return { statementMonth: `${month}-01`, periodStart, periodEnd, categories };
}

// POST /api/ar/statement-runs/preview - the same selection the run would
// freeze, without writing: N in scope, M to be replaced (show-expected-results).
exports.previewStatementRun = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const params = await readRunParams(req, companyId);
        const preview = await arStatement.previewRun({ companyId, ...params });
        res.status(200).json({ ...params, ...preview });
    } catch (err) {
        if (err && err.httpStatus) return res.status(err.httpStatus).json({ message: err.message });
        console.error('Error previewing statement run:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/ar/statement-runs - freeze the debtor list, queue the run and
// wake the worker. Returns the run id immediately; the worker does the rest
// and the screen just polls.
exports.createStatementRun = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const params = await readRunParams(req, companyId);
        const placement = await getCallerPlacement(req);
        const run = await arStatement.createRun({ companyId, ...params, stamps: ownershipStamps(req, placement) });
        res.status(201).json({ message: 'Statement run submitted.', run: runJson(run) });
    } catch (err) {
        if (err && err.httpStatus) return res.status(err.httpStatus).json({ message: err.message });
        console.error('Error creating statement run:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/ar/statement-runs/:id - the polling endpoint (progress %, counters).
exports.getStatementRun = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const run = await StatementRun.findOne({ where: { id: req.params.id, companyId } });
        if (!run) return res.status(404).json({ message: 'Statement run not found.' });
        res.status(200).json({ run: runJson(run) });
    } catch (err) {
        console.error('Error loading statement run:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/ar/statement-runs/:id/resume - re-queue a failed/cancelled run at
// exactly where it stopped.
exports.resumeStatementRun = async (req, res) => {
    try {
        const { companyId, userId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const run = await arStatement.resumeRun({ companyId, runId: req.params.id, userId });
        res.status(200).json({ message: 'Statement run resumed.', run: runJson(run) });
    } catch (err) {
        if (err && err.httpStatus) return res.status(err.httpStatus).json({ message: err.message });
        console.error('Error resuming statement run:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/ar/statement-runs/:id/cancel - stop a run (already-generated
// statements stay). Settles immediately when no worker holds the run;
// otherwise the worker honors it at the next chunk boundary.
exports.cancelStatementRun = async (req, res) => {
    try {
        const { companyId, userId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const run = await arStatement.cancelRun({ companyId, runId: req.params.id, userId });
        res.status(200).json({
            message: run.status === 'cancelling' ? 'Cancellation requested - stopping at the next chunk.' : 'Statement run cancelled.',
            run: runJson(run),
        });
    } catch (err) {
        if (err && err.httpStatus) return res.status(err.httpStatus).json({ message: err.message });
        console.error('Error cancelling statement run:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/ar/statement-runs - recent runs (history + resumable ones).
exports.listStatementRuns = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const rows = await StatementRun.findAll({
            where: { companyId },
            order: [['createdAt', 'DESC']],
            limit: 20,
        });
        res.status(200).json({ runs: rows.map(runJson) });
    } catch (err) {
        console.error('Error listing statement runs:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

function runJson(r) {
    return {
        id: r.id,
        statementMonth: r.statementMonth,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        scope: r.scope,
        status: r.status,
        totalDebtors: r.totalDebtors,
        processedCount: r.processedCount,
        generatedCount: r.generatedCount,
        replacedCount: r.replacedCount,
        errorMessage: r.errorMessage,
        createdAt: r.createdAt,
    };
}

// GET /api/ar/statements?month=YYYY-MM&category=... - listing (the separate
// Statement Listing screen; generation lives on /ar/statement-generation).
exports.listStatements = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const month = str(req.query.month);
        const category = str(req.query.category);
        const where = { companyId };
        if (MONTH_RE.test(month)) where.statementMonth = `${month}-01`;
        if (arStatement.STATEMENT_CATEGORIES.includes(category)) where.debtorCategory = category;
        const rows = await Statement.findAll({
            where,
            order: [['statementDate', 'DESC'], ['statementNo', 'ASC']],
            limit: 300,
        });
        res.status(200).json({
            statements: rows.map((r) => ({
                id: r.id,
                debtorId: r.debtorId,
                statementNo: r.statementNo,
                statementDate: r.statementDate,
                statementMonth: r.statementMonth,
                periodStart: r.periodStart,
                periodEnd: r.periodEnd,
                debtorType: r.debtorType,
                debtorCategory: r.debtorCategory,
                debtorNo: r.debtorNo,
                openingBalance: r.openingBalance,
                closingBalance: r.closingBalance,
                billName: r.billName,
                status: r.status,
            })),
        });
    } catch (err) {
        console.error('Error listing statements:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/ar/statements/:id - the frozen document (header + details). Fully
// self-contained for printing: party + issuer snapshots, aging, deposit.
exports.getStatement = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await Statement.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Statement not found.' });
        const details = await StatementDetail.findAll({
            where: { statementId: row.id },
            order: [['lineNo', 'ASC']],
        });
        // The company's column layout rides along so the viewer mirrors the
        // print (the listing menu need not have rights to /ar/settings).
        const setting = await arStatement.getSetting(companyId);
        // Country display names ride along (address standard: full name, never
        // the code) so the viewer needs no country lookup of its own.
        const { withCountryName } = require('../../platform/addressFormat');
        const statement = row.toJSON();
        statement.companyAddress = await withCountryName(statement.companyAddress);
        statement.billAddress = await withCountryName(statement.billAddress);
        res.status(200).json({ statement, details, columns: setting.statementColumns || null });
    } catch (err) {
        console.error('Error loading statement:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/ar/statements/:id/pdf - the printable Statement of Account,
// rendered entirely from the frozen snapshots (reprints are byte-identical).
exports.getStatementPdf = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await Statement.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Statement not found.' });
        const details = await StatementDetail.findAll({
            where: { statementId: row.id },
            order: [['lineNo', 'ASC']],
        });
        // Layout is presentation, resolved at render time (the DATA stays
        // frozen on the snapshot): the company's Level 1 options + logo.
        const setting = await arStatement.getSetting(companyId);
        const { getCompanyLetterhead } = require('../../platform/serviceContext');
        const letterhead = await getCompanyLetterhead(companyId);
        const layout = arStatement.statementLayoutOf(setting, letterhead ? letterhead.logo : null);
        const { renderStatementPdf } = require('./arStatementPdf');
        const pdf = await renderStatementPdf(row, details, layout);
        const safeNo = String(row.statementNo).replace(/[^A-Za-z0-9._-]/g, '_');
        res.status(200)
            .set({
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="Statement-${safeNo}.pdf"`,
                'Content-Length': pdf.length,
            })
            .send(pdf);
    } catch (err) {
        console.error('Error rendering statement PDF:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/ar/statements/:id/void - a statement is a frozen report; voiding
// it (e.g. before a corrected re-run) never touches balances.
exports.voidStatement = async (req, res) => {
    try {
        const { companyId, userId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await Statement.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Statement not found.' });
        if (row.status === 'void') return res.status(400).json({ message: 'This statement is already void.' });
        row.status = 'void';
        row.updatedBy = userId;
        await row.save();
        res.status(200).json({ message: `Statement ${row.statementNo} voided.` });
    } catch (err) {
        console.error('Error voiding statement:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};
