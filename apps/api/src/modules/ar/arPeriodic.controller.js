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
const StatementLine = require('./statementLine.model');
const posting = require('./arPosting.service');
const { generateInterest } = require('./arInterest.service');
const { generateStatements } = require('./arStatement.service');
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
        const issued = await numberingGateway.issueNumber(req, 'ar-debit-note', { transaction: t });
        if (issued && issued.number) return issued.number;
        // Synthetic fallback: bulk confirms can land in the same millisecond,
        // so suffix with the generation id to stay unique.
        return `DN-${Date.now().toString(36).toUpperCase()}-${gen.id.slice(0, 4).toUpperCase()}`;
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

        const interestType = await membershipGateway.ensureInterestType(companyId);
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
// Statement run

// POST /api/ar/statements { periodStart, periodEnd } - generate for every
// debtor with an opening balance or activity.
exports.generateStatementsRun = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const periodStart = str(req.body.periodStart);
        const periodEnd = str(req.body.periodEnd);
        if (!DATE_RE.test(periodStart) || !DATE_RE.test(periodEnd) || periodEnd < periodStart) {
            return res.status(400).json({ message: 'A valid period (start and end dates) is required.' });
        }

        const placement = await getCallerPlacement(req);
        const stamps = ownershipStamps(req, placement);
        // Synthetic fallback numbers get a per-run counter - a whole run posts
        // inside one transaction, so Date.now() alone would collide.
        let synthSeq = 0;
        const issueDocNo = async (t) => {
            const issued = await numberingGateway.issueNumber(req, 'ar-statement', { transaction: t });
            if (issued && issued.number) return issued.number;
            synthSeq += 1;
            return `ST-${Date.now().toString(36).toUpperCase()}-${synthSeq}`;
        };

        const result = await generateStatements({ companyId, periodStart, periodEnd, issueDocNo, stamps });
        res.status(200).json({
            message: `${result.generated} statement(s) generated. `
                + `${result.skippedExisting} debtor(s) already had a statement for this period.`,
            ...result,
        });
    } catch (err) {
        console.error('Error generating statements:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/ar/statements?month=YYYY-MM - listing.
exports.listStatements = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const month = str(req.query.month);
        const where = { companyId };
        if (MONTH_RE.test(month)) {
            where.periodEnd = { [Op.gte]: `${month}-01`, [Op.lte]: `${month}-31` };
        }
        const rows = await Statement.findAll({
            where,
            order: [['statementDate', 'DESC'], ['statementNo', 'ASC']],
            limit: 300,
        });
        const display = rows.length ? await debtorDisplayMap(companyId, [...new Set(rows.map((r) => r.debtorId))]) : new Map();
        res.status(200).json({
            statements: rows.map((r) => ({
                id: r.id,
                debtorId: r.debtorId,
                debtor: display.get(r.debtorId) || null,
                statementNo: r.statementNo,
                statementDate: r.statementDate,
                periodStart: r.periodStart,
                periodEnd: r.periodEnd,
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

// GET /api/ar/statements/:id - the frozen document (header + lines).
exports.getStatement = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await Statement.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Statement not found.' });
        const lines = await StatementLine.findAll({
            where: { statementId: row.id },
            order: [['lineNo', 'ASC']],
        });
        res.status(200).json({ statement: row, lines });
    } catch (err) {
        console.error('Error loading statement:', err);
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
