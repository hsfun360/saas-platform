// src/modules/ar/arStatement.service.js
//
// The statement run, rewritten 2026-08-06 for the print-complete design:
// per-company AR Setting (cutoff day + user-defined aging boundaries), debtor
// scope categories (individual / corporate / nominee / other), OVERWRITE
// semantics per (debtor, statementMonth), and chunked StatementRun processing
// so thousand-statement months report live progress and resume after any
// interruption (each debtor's statement commits in its own transaction).
// Background execution 2026-08-08: the OUTBOX WORKER drives the run (see
// processActiveRuns / the StatementRun model note); the screen only polls,
// and completion alerts the initiator in-app + by email (notifyRunDone).
//
// Statements/aging bucket by docDate (trxDate is financial-period reporting
// only). Void documents and their reversal rows net to zero and are EXCLUDED.
// Deposit money is COLLATERAL, not AR credit: receipt cents allocated to a
// deposit and refund cents funded BY a deposit stay off the statement balance.

const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const Debtor = require('./debtor.model');
const OtherDebtor = require('./otherDebtor.model');
const Ledger = require('./ledger.model');
const Receipt = require('./receipt.model');
const Deposit = require('./deposit.model');
const Allocation = require('./allocation.model');
const Statement = require('./statement.model');
const StatementDetail = require('./statementDetail.model');
const StatementRun = require('./statementRun.model');
const Setting = require('./setting.model');
const membershipGateway = require('../../platform/membershipGateway');
const { getCompanyLetterhead } = require('../../platform/serviceContext');
const { cents, money } = require('./arPosting.service');

const STATEMENT_CATEGORIES = ['individual', 'corporate', 'nominee', 'other'];
const DEFAULT_AGING = [30, 60, 90, 120, 150, 180];

function badRequest(message) {
    const err = new Error(message);
    err.httpStatus = 400;
    return err;
}

// ---------------------------------------------------------------------------
// AR Setting (per-company singleton)

async function getSetting(companyId) {
    let row = await Setting.findOne({ where: { companyId } });
    if (!row) {
        row = await Setting.create({
            companyId,
            statementCutoffDay: null,
            aging1: DEFAULT_AGING[0],
            aging2: DEFAULT_AGING[1],
            aging3: DEFAULT_AGING[2],
            aging4: DEFAULT_AGING[3],
            aging5: DEFAULT_AGING[4],
            aging6: DEFAULT_AGING[5],
        });
    }
    return row;
}

// The contiguous filled prefix of aging1..aging6 (stops at the first blank).
function boundariesOf(setting) {
    const out = [];
    for (const key of ['aging1', 'aging2', 'aging3', 'aging4', 'aging5', 'aging6']) {
        const v = setting[key];
        if (v === null || v === undefined) break;
        out.push(Number(v));
    }
    return out.length ? out : [...DEFAULT_AGING];
}

async function saveSetting(companyId, payload, stamps) {
    let cutoff = payload.statementCutoffDay;
    if (cutoff === '' || cutoff === undefined) cutoff = null;
    if (cutoff !== null) {
        cutoff = Number(cutoff);
        if (!Number.isInteger(cutoff) || cutoff < 1 || cutoff > 31) {
            throw badRequest('Statement cutoff day must be between 1 and 31 (or blank for calendar month).');
        }
    }
    // Aging boundaries: contiguous from aging1, strictly ascending, >= 1 day.
    const agings = [];
    let ended = false;
    for (const key of ['aging1', 'aging2', 'aging3', 'aging4', 'aging5', 'aging6']) {
        let v = payload[key];
        if (v === '' || v === undefined) v = null;
        if (v === null) { ended = true; agings.push(null); continue; }
        if (ended) throw badRequest('Aging boundaries must be filled left to right with no gaps.');
        v = Number(v);
        if (!Number.isInteger(v) || v < 1) throw badRequest('Each aging boundary must be a whole number of days (1 or more).');
        const prev = agings.filter((x) => x !== null).pop();
        if (prev !== undefined && v <= prev) throw badRequest('Each aging boundary must be greater than the previous one.');
        agings.push(v);
    }
    if (agings[0] === null) throw badRequest('At least the first aging boundary is required.');

    // Statement layout (Level 1): brand colour must be a #rrggbb hex or blank.
    let brandColor = payload.statementBrandColor;
    if (brandColor === '' || brandColor === undefined) brandColor = null;
    if (brandColor !== null && !/^#[0-9a-fA-F]{6}$/.test(String(brandColor))) {
        throw badRequest('Brand colour must be a 6-digit hex value like #1e3a8a (or blank for the standard look).');
    }
    let footerText = payload.statementFooterText;
    if (footerText === '' || footerText === undefined) footerText = null;
    if (footerText !== null) footerText = String(footerText).slice(0, 2000);

    const row = await getSetting(companyId);
    row.statementCutoffDay = cutoff;
    [row.aging1, row.aging2, row.aging3, row.aging4, row.aging5, row.aging6] = agings;
    row.statementShowLogo = payload.statementShowLogo !== false;
    row.statementBrandColor = brandColor;
    row.statementShowAging = payload.statementShowAging !== false;
    row.statementShowDeposit = payload.statementShowDeposit !== false;
    row.statementShowIncurredBy = payload.statementShowIncurredBy !== false;
    row.statementShowGeneratedNote = payload.statementShowGeneratedNote !== false;
    row.statementFooterText = footerText;
    if (!row.createdBy && stamps.createdBy) {
        row.createdBy = stamps.createdBy;
        row.createdByDepartmentId = stamps.createdByDepartmentId;
    }
    row.updatedBy = stamps.updatedBy;
    await row.save();
    return row;
}

// The renderer's Level 1 layout object from a Setting row (+ the club logo
// resolved by the caller through the letterhead seam).
function statementLayoutOf(setting, logoUrl = null) {
    return {
        logoUrl: setting.statementShowLogo !== false ? logoUrl : null,
        showLogo: setting.statementShowLogo !== false,
        brandColor: setting.statementBrandColor || null,
        showAging: setting.statementShowAging !== false,
        showDeposit: setting.statementShowDeposit !== false,
        showIncurredBy: setting.statementShowIncurredBy !== false,
        showGeneratedNote: setting.statementShowGeneratedNote !== false,
        footerText: setting.statementFooterText || null,
    };
}

// ---------------------------------------------------------------------------
// Period defaulting (cutoff rule)

function lastDayOfMonth(y, m) { // m = 1..12
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function fmtDate(y, m, d) {
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// month = 'YYYY-MM'. Cutoff day D: (prev month's D + 1) .. (this month's D),
// clamped to short months; null = the calendar month.
function defaultPeriod(month, cutoffDay) {
    const [y, m] = String(month).split('-').map(Number);
    if (!y || !m) return null;
    if (!cutoffDay) {
        return { periodStart: fmtDate(y, m, 1), periodEnd: fmtDate(y, m, lastDayOfMonth(y, m)) };
    }
    const end = Math.min(cutoffDay, lastDayOfMonth(y, m));
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    const prevEnd = Math.min(cutoffDay, lastDayOfMonth(py, pm));
    let sy = py; let sm = pm; let sd = prevEnd + 1;
    if (sd > lastDayOfMonth(py, pm)) { sy = y; sm = m; sd = 1; }
    return { periodStart: fmtDate(sy, sm, sd), periodEnd: fmtDate(y, m, end) };
}

// ---------------------------------------------------------------------------
// Debtor scope selection

// All open debtors of the company resolved to their scope category, filtered
// to the requested categories. Order is stable (createdAt) so a frozen run's
// progress list is deterministic.
async function selectDebtors(companyId, categories) {
    const debtors = await Debtor.findAll({
        where: { companyId, status: { [Op.ne]: 'closed' } },
        order: [['createdAt', 'ASC'], ['id', 'ASC']],
    });
    const ids = { membershipIds: [], memberIds: [] };
    for (const d of debtors) {
        if (d.debtorType === 'membership') ids.membershipIds.push(d.sourceId);
        else if (d.debtorType === 'member') ids.memberIds.push(d.sourceId);
    }
    const cls = await membershipGateway.classifyParties(companyId, ids);
    const wanted = new Set(categories);
    const out = [];
    for (const d of debtors) {
        let category = 'other';
        if (d.debtorType === 'membership') category = cls.memberships[d.sourceId] || 'individual';
        else if (d.debtorType === 'member') category = cls.members[d.sourceId] || 'individual';
        if (wanted.has(category)) out.push({ debtor: d, category });
    }
    return out;
}

function validCategories(input) {
    const arr = Array.isArray(input) ? input.filter((c) => STATEMENT_CATEGORIES.includes(c)) : [];
    return [...new Set(arr)];
}

// Preview = the same selection the run would freeze, without writing anything:
// how many debtors are in scope, and how many already carry a live statement
// for the month (those get REPLACED).
async function previewRun({ companyId, statementMonth, categories }) {
    const selected = await selectDebtors(companyId, categories);
    let replaced = 0;
    if (selected.length) {
        replaced = await Statement.count({
            where: {
                companyId,
                statementMonth,
                status: { [Op.ne]: 'void' },
                debtorId: { [Op.in]: selected.map((s) => s.debtor.id) },
            },
        });
    }
    return { total: selected.length, replaced };
}

// ---------------------------------------------------------------------------
// Run lifecycle (background execution - the run row IS the task queue)

const ACTIVE_RUN_STATUSES = ['queued', 'running', 'cancelling'];
const CHUNK_SIZE = 20;
const LEASE_SECONDS = 90;

function monthLabelOf(statementMonth) {
    const [y, m] = String(statementMonth).split('-').map(Number);
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return names[m - 1] ? `${names[m - 1]} ${y}` : String(statementMonth);
}

// Submit: freeze the debtor list, queue the run, wake the worker. The API
// returns immediately - the user is free to navigate anywhere.
async function createRun({ companyId, statementMonth, periodStart, periodEnd, categories, stamps }) {
    const active = await StatementRun.findOne({ where: { companyId, status: { [Op.in]: ACTIVE_RUN_STATUSES } } });
    if (active) throw badRequest('Another statement run is still in progress. Wait for it to finish or cancel it first.');
    const selected = await selectDebtors(companyId, categories);
    if (!selected.length) throw badRequest('No debtors match the selected scope.');
    const run = await StatementRun.create({
        companyId,
        statementMonth,
        periodStart,
        periodEnd,
        scope: categories,
        debtorIds: selected.map((s) => s.debtor.id),
        status: 'queued',
        totalDebtors: selected.length,
        ...stamps,
    });
    const { pingOutboxWorker } = require('../../platform/outboxWorkerPing');
    pingOutboxWorker();
    return run;
}

// Cancel: settle immediately when no worker holds the run (queued, or lease
// expired); otherwise flag 'cancelling' and the worker settles it at the next
// chunk boundary. Already-generated statements always stay.
async function cancelRun({ companyId, runId, userId }) {
    const run = await StatementRun.findOne({ where: { id: runId, companyId } });
    if (!run) {
        const err = new Error('Statement run not found.');
        err.httpStatus = 404;
        throw err;
    }
    if (!ACTIVE_RUN_STATUSES.includes(run.status)) throw badRequest(`This run is already ${run.status}.`);
    const leaseHeld = run.leaseUntil && new Date(run.leaseUntil).getTime() > Date.now();
    run.status = (run.status === 'queued' || !leaseHeld) ? 'cancelled' : 'cancelling';
    run.updatedBy = userId;
    await run.save();
    return run;
}

// Resume a failed (or cancelled) run: re-queue it at processedCount and wake
// the worker.
async function resumeRun({ companyId, runId, userId }) {
    const run = await StatementRun.findOne({ where: { id: runId, companyId } });
    if (!run) {
        const err = new Error('Statement run not found.');
        err.httpStatus = 404;
        throw err;
    }
    if (!['failed', 'cancelled'].includes(run.status)) throw badRequest(`Only a failed or cancelled run can be resumed (this one is ${run.status}).`);
    if (run.processedCount >= run.totalDebtors) throw badRequest('This run already processed every debtor.');
    run.status = 'queued';
    run.errorMessage = null;
    run.leaseUntil = null;
    run.notifiedAt = null;
    run.updatedBy = userId;
    await run.save();
    const { pingOutboxWorker } = require('../../platform/outboxWorkerPing');
    pingOutboxWorker();
    return run;
}

// Atomic worker claim: take the run only when nobody holds a live lease.
async function claimRun(runId) {
    const [rows] = await sequelize.query(
        `UPDATE ar."StatementRun" SET
             status = CASE WHEN status = 'queued' THEN 'running' ELSE status END,
             "leaseUntil" = now() + interval '${LEASE_SECONDS} seconds',
             "updatedAt" = now()
         WHERE id = :id AND status IN ('queued', 'running', 'cancelling')
           AND ("leaseUntil" IS NULL OR "leaseUntil" < now())
         RETURNING id`,
        { replacements: { id: runId } },
    );
    return rows.length > 0;
}

// WORKER ENTRY - called from the drain handler. Processes claimable runs
// oldest-first inside the time budget; each run advances in chunks with the
// lease renewed per chunk (a crash just lets the lease expire). Returns
// { remaining: true } when budget ran out with work left, so the worker can
// kick a fresh drain (self-ping) instead of waiting for the 5-minute sweep.
async function processActiveRuns({ timeBudgetMs = 240000 } = {}) {
    const started = Date.now();
    let remaining = false;
    for (;;) {
        const budget = timeBudgetMs - (Date.now() - started);
        if (budget < 5000) {
            const open = await StatementRun.count({ where: { status: { [Op.in]: ACTIVE_RUN_STATUSES } } });
            remaining = open > 0;
            break;
        }
        const run = await StatementRun.findOne({
            where: {
                status: { [Op.in]: ACTIVE_RUN_STATUSES },
                [Op.or]: [{ leaseUntil: null }, { leaseUntil: { [Op.lt]: new Date() } }],
            },
            order: [['createdAt', 'ASC']],
        });
        if (!run) break;
        if (!(await claimRun(run.id))) break; // raced by a concurrent drain - its chain continues
        const outcome = await runSlice(run.id, budget);
        if (outcome === 'yielded') remaining = true;
    }
    return { remaining };
}

// One time-boxed slice of a claimed run. Chunks of CHUNK_SIZE debtors, one
// transaction per debtor (crash-safe: overwrite semantics make reprocessing a
// debtor idempotent), status re-read every chunk so Cancel takes effect
// mid-run, lease renewed as the heartbeat.
async function runSlice(runId, budgetMs) {
    const run = await StatementRun.findByPk(runId);
    if (!run) return 'done';
    const { companyId } = run;
    const setting = await getSetting(companyId);
    const boundaries = boundariesOf(setting);
    const letterhead = await getCompanyLetterhead(companyId);
    const numberingGateway = require('../../platform/numberingGateway');
    const started = Date.now();
    let synthSeq = 0;
    const issueDocNo = async (t) => {
        const issued = await numberingGateway.issueNumberForCompany(companyId, 'ar-statement', { transaction: t });
        if (issued && issued.number) return issued.number;
        synthSeq += 1;
        return `ST-${Date.now().toString(36).toUpperCase()}-${synthSeq}`;
    };
    const stamps = { updatedBy: run.createdBy || null };

    for (;;) {
        await run.reload();
        if (run.status === 'cancelling') {
            run.status = 'cancelled';
            run.leaseUntil = null;
            await run.save();
            return 'done';
        }
        if (run.status !== 'running') return 'done';

        const ids = run.debtorIds.slice(run.processedCount, run.processedCount + CHUNK_SIZE);
        if (!ids.length) {
            run.status = 'completed';
            run.leaseUntil = null;
            run.lastProcessedAt = new Date();
            await run.save();
            await notifyRunDone(run);
            return 'done';
        }

        const debtors = await Debtor.findAll({ where: { companyId, id: { [Op.in]: ids } } });
        const byId = new Map(debtors.map((d) => [d.id, d]));
        const clsIds = { membershipIds: [], memberIds: [] };
        for (const d of debtors) {
            if (d.debtorType === 'membership') clsIds.membershipIds.push(d.sourceId);
            else if (d.debtorType === 'member') clsIds.memberIds.push(d.sourceId);
        }
        const cls = await membershipGateway.classifyParties(companyId, clsIds);

        for (const id of ids) {
            const debtor = byId.get(id);
            if (!debtor) { run.processedCount += 1; continue; }
            let category = 'other';
            if (debtor.debtorType === 'membership') category = cls.memberships[debtor.sourceId] || 'individual';
            else if (debtor.debtorType === 'member') category = cls.members[debtor.sourceId] || 'individual';
            try {
                const r = await generateOne({
                    companyId,
                    debtor,
                    category,
                    statementMonth: run.statementMonth,
                    periodStart: run.periodStart,
                    periodEnd: run.periodEnd,
                    boundaries,
                    letterhead,
                    issueDocNo,
                    stamps,
                });
                run.processedCount += 1;
                if (r.generated) run.generatedCount += 1;
                if (r.replaced) run.replacedCount += 1;
            } catch (e) {
                run.status = 'failed';
                run.errorMessage = (e && e.message) ? String(e.message).slice(0, 250) : 'Statement generation failed.';
                run.leaseUntil = null;
                run.lastProcessedAt = new Date();
                await run.save();
                await notifyRunDone(run);
                return 'done';
            }
        }

        run.leaseUntil = new Date(Date.now() + LEASE_SECONDS * 1000);
        run.lastProcessedAt = new Date();
        await run.save();

        if (Date.now() - started > budgetMs) {
            // Voluntary yield: release the lease so the next drain (self-ping
            // or sweep) resumes instantly.
            run.leaseUntil = null;
            await run.save();
            return 'yielded';
        }
    }
}

// Completion alerting (objective 2): in-app notification + templated email to
// the user who started the run. notifiedAt is the exactly-once guard; a
// cancelled run alerts nobody (the user did it themselves).
async function notifyRunDone(run) {
    try {
        if (run.notifiedAt || !run.createdBy) return;
        if (!['completed', 'failed'].includes(run.status)) return;
        run.notifiedAt = new Date();
        await run.save();

        const notificationGateway = require('../../platform/notificationGateway');
        const label = monthLabelOf(run.statementMonth);
        const failed = run.status === 'failed';
        const title = failed
            ? `Statement run failed - ${label}`
            : `${label} statements are ready`;
        const body = failed
            ? `Stopped after ${run.processedCount} of ${run.totalDebtors} debtor(s): ${run.errorMessage || 'unknown error'}`
            : `${run.generatedCount} statement(s) generated (${run.replacedCount} replaced) for ${run.totalDebtors} debtor(s).`;
        await notificationGateway.notifyUser({
            userId: run.createdBy,
            companyId: run.companyId,
            type: 'statement-run-completed',
            title,
            body,
            linkRoute: failed ? '/ar/statement-generation' : '/ar/statements',
        });
        await notificationGateway.emailUser({
            userId: run.createdBy,
            companyId: run.companyId,
            templateKey: 'ar.statement-run-completed',
            data: {
                monthLabel: label,
                status: run.status,
                failed,
                generated: run.generatedCount,
                replaced: run.replacedCount,
                processed: run.processedCount,
                total: run.totalDebtors,
                errorMessage: run.errorMessage || '',
                listLink: `${(process.env.FRONTEND_BASE_URL || '').replace(/\/$/, '')}/ar/statements`,
            },
        });
    } catch (e) {
        // Alerting must never fail the run itself.
        console.error('[AR STATEMENTS] completion notification failed:', e.message);
    }
}

// ---------------------------------------------------------------------------
// Per-debtor generation

// Signed cents effect of a document on the debtor's AR balance (deposit cents
// excluded - see header note).
function docDelta(doc) {
    if (doc.kind === 'ledger') return doc.mode === 'debit' ? cents(doc.grossAmount) : -cents(doc.grossAmount);
    const ar = cents(doc.amount) - (doc.depositC || 0);
    return doc.docKind === 'receipt' ? -ar : ar;
}

function daysBetween(fromDate, toDate) {
    return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86400000);
}

// Bucket index for an age in days: <= b[0] -> 0, b[0] < age <= b[1] -> 1, ...,
// age > b[last] -> boundaries.length (the overflow column).
function bucketIndex(age, boundaries) {
    for (let i = 0; i < boundaries.length; i += 1) {
        if (age <= boundaries[i]) return i;
    }
    return boundaries.length;
}

async function generateOne({
    companyId, debtor, category, statementMonth, periodStart, periodEnd,
    boundaries, letterhead, issueDocNo, stamps,
}) {
    // --- Load this debtor's posted documents up to the period end ---
    const [ledgerRows, receiptRows, depositRows] = await Promise.all([
        Ledger.findAll({
            where: { companyId, debtorId: debtor.id, status: { [Op.ne]: 'void' }, reversalOfId: null, docDate: { [Op.lte]: periodEnd } },
        }),
        Receipt.findAll({
            where: { companyId, debtorId: debtor.id, status: { [Op.ne]: 'void' }, docDate: { [Op.lte]: periodEnd } },
        }),
        Deposit.findAll({
            where: { companyId, debtorId: debtor.id, status: { [Op.ne]: 'void' }, docDate: { [Op.lte]: periodEnd } },
        }),
    ]);

    // Allocations touching this debtor's documents (allocations never cross
    // debtors, so doc-id lists cover everything).
    const ledgerIds = ledgerRows.map((r) => r.id);
    const receiptIds = receiptRows.map((r) => r.id);
    const depositIds = depositRows.map((r) => r.id);
    const allDocIds = [...ledgerIds, ...receiptIds, ...depositIds];
    const allocs = allDocIds.length
        ? await Allocation.findAll({
            where: {
                companyId,
                [Op.or]: [
                    { creditDocId: { [Op.in]: allDocIds } },
                    { debitDocId: { [Op.in]: allDocIds } },
                ],
            },
        })
        : [];

    // Per-document cents that belong to deposits, not AR: receipt -> deposit
    // (collection) and deposit -> refund (deposit paid back).
    const depositCByDoc = new Map();
    for (const a of allocs) {
        if (a.creditDocType === 'receipt' && a.debitDocType === 'deposit') {
            depositCByDoc.set(a.creditDocId, (depositCByDoc.get(a.creditDocId) || 0) + cents(a.amount));
        } else if (a.creditDocType === 'deposit' && a.debitDocType === 'refund') {
            depositCByDoc.set(a.debitDocId, (depositCByDoc.get(a.debitDocId) || 0) + cents(a.amount));
        }
    }

    const docs = [];
    for (const r of ledgerRows) {
        docs.push({ kind: 'ledger', row: r, mode: r.mode, docKind: r.docKind, docDate: r.docDate, grossAmount: r.grossAmount, createdAt: r.createdAt });
    }
    for (const r of receiptRows) {
        docs.push({
            kind: 'receipt', row: r, mode: r.mode, docKind: r.docKind, docDate: r.docDate,
            amount: r.amount, createdAt: r.createdAt, depositC: depositCByDoc.get(r.id) || 0,
        });
    }
    docs.sort((a, b) => (a.docDate < b.docDate ? -1 : a.docDate > b.docDate ? 1 : (a.createdAt < b.createdAt ? -1 : 1)));

    let openingC = 0;
    const period = [];
    for (const doc of docs) {
        // A receipt fully consumed by deposit collection (or a refund fully
        // funded by a deposit) has zero AR effect - deposit report material,
        // not statement material.
        if (doc.kind === 'receipt' && docDelta(doc) === 0) continue;
        if (doc.docDate < periodStart) openingC += docDelta(doc);
        else period.push(doc);
    }

    // Existing statement(s) for this debtor + month: the overwrite target.
    const existing = await Statement.findAll({ where: { companyId, debtorId: debtor.id, statementMonth } });

    if (openingC === 0 && period.length === 0) {
        // Nothing to report. Still clear a stale statement from an earlier run
        // of the month (its documents were voided since).
        if (existing.length) {
            await sequelize.transaction(async (t) => {
                await StatementDetail.destroy({ where: { statementId: { [Op.in]: existing.map((s) => s.id) } }, transaction: t });
                await Statement.destroy({ where: { id: { [Op.in]: existing.map((s) => s.id) } }, transaction: t });
            });
            return { generated: false, replaced: true };
        }
        return { generated: false, replaced: false };
    }

    // --- Party snapshot through the seams (other debtors resolve locally) ---
    let billName = null;
    let billAddress = null;
    let debtorNo = null;
    let contactPerson = null;
    if (debtor.debtorType === 'other') {
        const o = await OtherDebtor.findByPk(debtor.sourceId);
        if (o) {
            billName = o.name;
            debtorNo = o.code;
            contactPerson = o.contactPerson || null;
            billAddress = {
                line1: o.address1, line2: o.address2, line3: o.address3,
                city: o.city, state: o.state, postcode: o.postcode, countryCode: o.countryCode,
            };
        }
    } else {
        const b = await membershipGateway.lookupPartyBilling(companyId, debtor.debtorType, debtor.sourceId);
        if (b) {
            billName = b.name;
            debtorNo = b.no;
            contactPerson = b.contactPerson || null;
            billAddress = b.address;
        }
    }
    if (!billName) billName = 'Unknown debtor';

    const persons = await membershipGateway.listDebtorPersons(companyId, debtor.debtorType, debtor.sourceId);
    const personName = new Map(persons.map((p) => [p.id, p.name]));

    // --- Lines with running balance ---
    let closingC = openingC;
    const lines = period.map((doc, i) => {
        const delta = docDelta(doc);
        closingC += delta;
        return {
            companyId,
            lineNo: i + 1,
            docDate: doc.docDate,
            docType: doc.docKind,
            docId: doc.row.id,
            docNo: doc.row.docNo,
            description: doc.row.description || null,
            incurredByMemberId: doc.kind === 'ledger' ? doc.row.incurredByMemberId : null,
            incurredByName: doc.kind === 'ledger' && doc.row.incurredByMemberId
                ? (personName.get(doc.row.incurredByMemberId) || null) : null,
            debit: delta > 0 ? money(delta) : '0.00',
            credit: delta < 0 ? money(-delta) : '0.00',
            balance: money(closingC),
        };
    });

    // --- Aging of the closing balance at periodEnd ---
    // Debit open items age by days overdue from dueDate (docDate fallback),
    // with allocations counted as-of the period end (a settlement whose credit
    // document is dated after periodEnd hadn't happened yet on this statement).
    // The net credit side (receipts/CNs not yet applied) lands in the first
    // bucket, so the buckets always sum exactly to the closing balance.
    const docDateById = new Map();
    for (const r of ledgerRows) docDateById.set(r.id, r.docDate);
    for (const r of receiptRows) docDateById.set(r.id, r.docDate);
    const allocatedAsOfC = new Map();
    for (const a of allocs) {
        if (a.debitDocType !== 'ledger') continue;
        const creditDate = docDateById.get(a.creditDocId);
        if (!creditDate || creditDate > periodEnd) continue;
        allocatedAsOfC.set(a.debitDocId, (allocatedAsOfC.get(a.debitDocId) || 0) + cents(a.amount));
    }
    const agingC = new Array(7).fill(0);
    let totalRemainC = 0;
    for (const r of ledgerRows) {
        if (r.mode !== 'debit') continue;
        const remainC = cents(r.grossAmount) - (allocatedAsOfC.get(r.id) || 0);
        if (remainC <= 0) continue;
        totalRemainC += remainC;
        const age = daysBetween(r.dueDate || r.docDate, periodEnd);
        agingC[Math.min(bucketIndex(age, boundaries), 6)] += remainC;
    }
    agingC[0] += closingC - totalRemainC;

    // Deposit balance snapshot (held minus utilized, deposits up to periodEnd).
    let depositC = 0;
    for (const d of depositRows) depositC += cents(d.collectedAmount) - cents(d.utilizedAmount);

    // --- Overwrite + create, one transaction per debtor ---
    await sequelize.transaction(async (t) => {
        if (existing.length) {
            await StatementDetail.destroy({ where: { statementId: { [Op.in]: existing.map((s) => s.id) } }, transaction: t });
            await Statement.destroy({ where: { id: { [Op.in]: existing.map((s) => s.id) } }, transaction: t });
        }
        const st = await Statement.create({
            companyId,
            debtorId: debtor.id,
            statementNo: await issueDocNo(t),
            statementDate: periodEnd,
            statementMonth,
            periodStart,
            periodEnd,
            debtorType: debtor.debtorType,
            debtorCategory: category,
            debtorNo,
            openingBalance: money(openingC),
            closingBalance: money(closingC),
            billName,
            billAddress,
            contactPerson,
            companyName: (letterhead && letterhead.name) || '',
            companyAddress: (letterhead && letterhead.address) || null,
            deposit: money(depositC),
            aging1: money(agingC[0]),
            aging2: money(agingC[1]),
            aging3: money(agingC[2]),
            aging4: money(agingC[3]),
            aging5: money(agingC[4]),
            aging6: money(agingC[5]),
            aging7: money(agingC[6]),
            agingBoundaries: boundaries,
            status: 'generated',
            ...stamps,
        }, { transaction: t });
        if (lines.length) {
            await StatementDetail.bulkCreate(lines.map((l) => ({ ...l, statementId: st.id })), { transaction: t });
        }
    });

    return { generated: true, replaced: existing.length > 0 };
}

module.exports = {
    STATEMENT_CATEGORIES,
    getSetting,
    saveSetting,
    statementLayoutOf,
    boundariesOf,
    defaultPeriod,
    validCategories,
    previewRun,
    createRun,
    cancelRun,
    resumeRun,
    processActiveRuns,
};
