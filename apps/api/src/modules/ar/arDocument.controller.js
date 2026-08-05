// Account Receivable - the debtor account page: document inquiry + manual
// document entry (Invoice, Adjustment DN/CN, Official Receipt, Refund,
// Deposit collect/convert) + void flows. Everything runs through
// arPosting.service (single balance authority) and gates on the '/ar/debtors'
// menu (the account page is the listing's detail surface, no separate menu).

const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const Debtor = require('./debtor.model');
const CreditAccount = require('./creditAccount.model');
const CreditMemberLimit = require('./creditMemberLimit.model');
const OtherDebtor = require('./otherDebtor.model');
const Ledger = require('./ledger.model');
const Receipt = require('./receipt.model');
const Deposit = require('./deposit.model');
const Allocation = require('./allocation.model');
const posting = require('./arPosting.service');
const { getUserContext, getCallerPlacement } = require('../../platform/serviceContext');
const membershipGateway = require('../../platform/membershipGateway');
const numberingGateway = require('../../platform/numberingGateway');
const { quoteTax } = require('../../platform/taxGateway');
const { LEDGER_DOC_KINDS, DEPOSIT_NUMBERING_PURPOSE } = require('./ar.constants');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SYNTHETIC_PREFIX = {
    'ar-invoice': 'INV', 'ar-debit-note': 'DN', 'ar-credit-note': 'CN',
    'ar-receipt': 'OR', 'ar-refund': 'RF', 'ar-deposit': 'DEP',
};

function str(x) { return typeof x === 'string' ? x.trim() : ''; }
function strOrNull(x) { const s = str(x); return s || null; }

function ownershipStamps(req, placement) {
    const callerId = getUserContext(req).userId;
    return { createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId };
}

function parseDates(body) {
    const docDate = str(body.docDate);
    if (!DATE_RE.test(docDate)) return { error: 'Document date is required (YYYY-MM-DD).' };
    let trxDate = strOrNull(body.trxDate) || docDate;
    if (!DATE_RE.test(trxDate)) return { error: 'Transaction date must be YYYY-MM-DD.' };
    return { docDate, trxDate };
}

function parseAmount(x) {
    const n = Number(x);
    if (!Number.isFinite(n) || n <= 0) return null;
    return posting.cents(n);
}

async function loadDebtor(req) {
    const { companyId } = getUserContext(req);
    if (!companyId) return { error: { status: 400, message: 'Select a workspace first.' } };
    const debtor = await Debtor.findOne({ where: { id: req.params.id, companyId } });
    if (!debtor) return { error: { status: 404, message: 'Debtor not found.' } };
    return { companyId, debtor };
}

// Build an issueDocNo(t) closure for a numbering purpose: auto -> gapless
// in-tx issue; manual -> the caller's number (uniqueness pre-checked by the
// caller); no scheme -> the caller's number, else a synthetic fallback so
// SYSTEM-generated documents (void reversals, conversion CNs) never block on
// missing setup.
function docNoIssuer(req, purpose, manualNo) {
    return async (t) => {
        const issued = await numberingGateway.issueNumber(req, purpose, { transaction: t });
        if (issued && issued.number) return issued.number;
        if (manualNo) return manualNo;
        const synth = `${SYNTHETIC_PREFIX[purpose] || 'DOC'}-${Date.now().toString(36).toUpperCase()}`;
        return synth;
    };
}

async function ledgerNoInUse(companyId, docKind, docNo) {
    return !!(await Ledger.findOne({ where: { companyId, docKind, docNo }, attributes: ['id'] }));
}
async function receiptNoInUse(companyId, docKind, docNo) {
    return !!(await Receipt.findOne({ where: { companyId, docKind, docNo }, attributes: ['id'] }));
}

// ---------------------------------------------------------------------------
// GET /api/ar/debtors/:id/account - the account page payload: identity,
// balances, person caps, and the document books (recent first).
exports.getAccount = async (req, res) => {
    try {
        const { error, companyId, debtor } = await loadDebtor(req);
        if (error) return res.status(error.status).json({ message: error.message });

        const [pool, caps, ledger, receipts, deposits] = await Promise.all([
            CreditAccount.findOne({ where: { debtorId: debtor.id } }),
            CreditMemberLimit.findAll({ where: { debtorId: debtor.id } }),
            Ledger.findAll({ where: { debtorId: debtor.id }, order: [['docDate', 'DESC'], ['createdAt', 'DESC']], limit: 200 }),
            Receipt.findAll({ where: { debtorId: debtor.id }, order: [['docDate', 'DESC'], ['createdAt', 'DESC']], limit: 200 }),
            Deposit.findAll({ where: { debtorId: debtor.id }, order: [['docDate', 'DESC'], ['createdAt', 'DESC']], limit: 100 }),
        ]);

        // Party display via the seams.
        let no = null; let name = null;
        if (debtor.debtorType === 'other') {
            const o = await OtherDebtor.findByPk(debtor.sourceId, { attributes: ['code', 'name'] });
            if (o) { no = o.code; name = o.name; }
        } else {
            const ids = debtor.debtorType === 'membership'
                ? { membershipIds: [debtor.sourceId] } : { memberIds: [debtor.sourceId] };
            const display = await membershipGateway.lookupPartyDisplay(companyId, ids);
            const d = debtor.debtorType === 'membership'
                ? display.memberships[debtor.sourceId] : display.members[debtor.sourceId];
            if (d) { no = d.no; name = d.name; }
        }

        // Person names for incurredBy display on documents.
        const persons = await membershipGateway.listDebtorPersons(companyId, debtor.debtorType, debtor.sourceId);
        const personById = new Map(persons.map((p) => [p.id, p]));

        res.status(200).json({
            debtor: {
                id: debtor.id, debtorType: debtor.debtorType, sourceId: debtor.sourceId,
                no, name, terms: debtor.terms, sendReminders: debtor.sendReminders,
                chargeInterest: debtor.chargeInterest, status: debtor.status,
            },
            balances: {
                creditLimit: pool ? pool.creditLimit : '0.00',
                outstanding: pool ? pool.outstanding : '0.00',
            },
            personCaps: caps.map((c) => ({
                memberId: c.memberId,
                person: personById.get(c.memberId) || null,
                personalLimit: c.personalLimit,
                personalUsed: c.personalUsed,
            })),
            ledger: ledger.map((r) => ({
                id: r.id, docKind: r.docKind, mode: r.mode, docNo: r.docNo,
                docDate: r.docDate, trxDate: r.trxDate, dueDate: r.dueDate,
                description: r.description,
                incurredBy: r.incurredByMemberId ? (personById.get(r.incurredByMemberId) || null) : null,
                sourceModule: r.sourceModule, sourceRef: r.sourceRef,
                netAmount: r.netAmount, taxAmount: r.taxAmount, grossAmount: r.grossAmount,
                settledAmount: r.settledAmount, status: r.status, reversalOfId: r.reversalOfId,
            })),
            receipts: receipts.map((r) => ({
                id: r.id, docKind: r.docKind, mode: r.mode, docNo: r.docNo,
                docDate: r.docDate, trxDate: r.trxDate,
                paymentMethod: r.paymentMethod, paymentRef: r.paymentRef, description: r.description,
                amount: r.amount, allocatedAmount: r.allocatedAmount, status: r.status,
            })),
            deposits: deposits.map((d) => ({
                id: d.id, docNo: d.docNo, docDate: d.docDate, trxDate: d.trxDate,
                description: d.description, amount: d.amount,
                collectedAmount: d.collectedAmount, utilizedAmount: d.utilizedAmount, status: d.status,
            })),
        });
    } catch (err) {
        console.error('Error loading debtor account:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/ar/debtors/:id/account/meta - the entry dialogs' pickers: billing
// items (Transaction Types), persons, numbering modes per document series.
exports.getAccountMeta = async (req, res) => {
    try {
        const { error, companyId, debtor } = await loadDebtor(req);
        if (error) return res.status(error.status).json({ message: error.message });

        const purposes = ['ar-invoice', 'ar-debit-note', 'ar-credit-note', 'ar-receipt', 'ar-refund', 'ar-deposit'];
        const modes = {};
        for (const p of purposes) modes[p] = await numberingGateway.getMode(req, p);

        res.status(200).json({
            transactionTypes: await membershipGateway.listTransactionTypes(companyId),
            persons: await membershipGateway.listDebtorPersons(companyId, debtor.debtorType, debtor.sourceId),
            numberingModes: modes,
        });
    } catch (err) {
        console.error('Error loading debtor account meta:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/ar/documents/:type/:id/allocations - a document's allocation rows
// (both directions), for the drill-down.
exports.getAllocations = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const type = str(req.params.type);
        if (!['ledger', 'receipt', 'deposit', 'refund'].includes(type)) {
            return res.status(400).json({ message: 'Invalid document type.' });
        }
        // A document can sit on the credit side (receipt/ledger-credit/deposit)
        // and/or the debit side (ledger-debit/refund/deposit) of the web.
        const or = [];
        if (['receipt', 'ledger', 'deposit'].includes(type)) or.push({ creditDocType: type, creditDocId: req.params.id });
        if (['ledger', 'refund', 'deposit'].includes(type)) or.push({ debitDocType: type, debitDocId: req.params.id });
        const rows = await Allocation.findAll({
            where: { companyId, [Op.or]: or },
            order: [['createdAt', 'ASC']],
        });
        res.status(200).json({ allocations: rows });
    } catch (err) {
        console.error('Error loading allocations:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---------------------------------------------------------------------------
// POST /api/ar/debtors/:id/ledger - manual Invoice / Debit Note / Credit Note.
exports.postLedger = async (req, res) => {
    try {
        const { error, companyId, debtor } = await loadDebtor(req);
        if (error) return res.status(error.status).json({ message: error.message });

        const kind = LEDGER_DOC_KINDS.find((k) => k.key === str(req.body.docKind));
        if (!kind) return res.status(400).json({ message: 'Select the document kind.' });
        const dates = parseDates(req.body);
        if (dates.error) return res.status(400).json({ message: dates.error });
        const amountC = parseAmount(req.body.amount);
        if (!amountC) return res.status(400).json({ message: 'Amount must be greater than zero.' });

        const txnType = await membershipGateway.getTransactionType(companyId, str(req.body.transactionTypeId));
        if (!txnType) return res.status(400).json({ message: 'Select a transaction type.' });

        // incurredBy must be a person of THIS debtor.
        const incurredByMemberId = strOrNull(req.body.incurredByMemberId);
        if (incurredByMemberId) {
            const persons = await membershipGateway.listDebtorPersons(companyId, debtor.debtorType, debtor.sourceId);
            if (!persons.some((p) => p.id === incurredByMemberId)) {
                return res.status(400).json({ message: 'The selected person does not belong to this debtor.' });
            }
        }

        // CN: optional specific target document.
        let targetLedger = null;
        const targetLedgerId = strOrNull(req.body.targetLedgerId);
        if (kind.key === 'credit-note' && targetLedgerId) {
            targetLedger = await Ledger.findOne({
                where: { id: targetLedgerId, debtorId: debtor.id, mode: 'debit', status: { [Op.in]: ['open'] } },
            });
            if (!targetLedger) return res.status(400).json({ message: 'The target document is not an open debit of this debtor.' });
        }

        // Tax snapshot from the Transaction Type's scheme (single tax source).
        let amounts = { netC: amountC, taxC: 0, grossC: amountC, taxSchemeCode: null, taxRate: null };
        if (txnType.taxSchemeCode) {
            const q = await quoteTax(req, { taxSchemeCode: txnType.taxSchemeCode, amount: amountC / 100, onDate: dates.docDate });
            if (!q) return res.status(400).json({ message: `Tax scheme '${txnType.taxSchemeCode}' could not be resolved for this company.` });
            amounts = {
                netC: posting.cents(q.net),
                taxC: posting.cents(q.taxTotal),
                grossC: posting.cents(q.gross),
                taxSchemeCode: txnType.taxSchemeCode,
                taxRate: q.lines.reduce((s, l) => s + Number(l.taxRate || 0), 0).toFixed(4),
            };
        }

        // Manual numbering pre-checks (a 400 here burns nothing).
        const manualNo = strOrNull(req.body.docNo);
        const mode = await numberingGateway.getMode(req, kind.numberingPurpose);
        if (mode !== 'auto' && manualNo && await ledgerNoInUse(companyId, kind.key, manualNo)) {
            return res.status(409).json({ message: `${kind.label} number '${manualNo}' is already in use.` });
        }
        if (mode === 'manual' && !manualNo) {
            return res.status(400).json({ message: `${kind.label} number is required (numbering is manual).` });
        }

        const placement = await getCallerPlacement(req);
        const stamps = ownershipStamps(req, placement);

        let row;
        try {
            row = await sequelize.transaction(async (t) => posting.postLedgerDoc({
                companyId, debtor, docKind: kind.key,
                issueDocNo: docNoIssuer(req, kind.numberingPurpose, manualNo),
                docDate: dates.docDate, trxDate: dates.trxDate,
                transactionTypeId: txnType.id,
                isInterestChargeable: txnType.isInterestChargeable === true,
                description: strOrNull(req.body.description),
                incurredByMemberId,
                sourceModule: 'ar', sourceRef: 'manual',
                amounts, stamps, targetLedger,
                fifo: kind.key === 'credit-note' && req.body.fifo === true,
                t,
            }));
        } catch (e) {
            if (e && e.httpStatus) return res.status(e.httpStatus).json({ message: e.message });
            throw e;
        }
        res.status(201).json({ message: `${kind.label} ${row.docNo} posted.`, id: row.id, docNo: row.docNo });
    } catch (err) {
        console.error('Error posting ledger document:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/ar/debtors/:id/receipts - Official Receipt (optionally collecting
// a deposit first; the remainder FIFO-allocates unless autoAllocate=false).
exports.postReceipt = async (req, res) => {
    try {
        const { error, companyId, debtor } = await loadDebtor(req);
        if (error) return res.status(error.status).json({ message: error.message });
        const dates = parseDates(req.body);
        if (dates.error) return res.status(400).json({ message: dates.error });
        const amountC = parseAmount(req.body.amount);
        if (!amountC) return res.status(400).json({ message: 'Amount must be greater than zero.' });

        let depositRow = null;
        const depositId = strOrNull(req.body.depositId);
        if (depositId) {
            depositRow = await Deposit.findOne({ where: { id: depositId, debtorId: debtor.id, status: 'open' } });
            if (!depositRow) return res.status(400).json({ message: 'Deposit not found (or not open) on this debtor.' });
        }

        const manualNo = strOrNull(req.body.docNo);
        const mode = await numberingGateway.getMode(req, 'ar-receipt');
        if (mode !== 'auto' && manualNo && await receiptNoInUse(companyId, 'receipt', manualNo)) {
            return res.status(409).json({ message: `Receipt number '${manualNo}' is already in use.` });
        }
        if (mode === 'manual' && !manualNo) {
            return res.status(400).json({ message: 'Receipt number is required (numbering is manual).' });
        }

        const placement = await getCallerPlacement(req);
        const stamps = ownershipStamps(req, placement);

        let row;
        try {
            row = await sequelize.transaction(async (t) => posting.postReceipt({
                companyId, debtor,
                issueDocNo: docNoIssuer(req, 'ar-receipt', manualNo),
                docDate: dates.docDate, trxDate: dates.trxDate,
                paymentMethod: strOrNull(req.body.paymentMethod),
                paymentRef: strOrNull(req.body.paymentRef),
                description: strOrNull(req.body.description),
                amountC, depositRow,
                autoAllocate: req.body.autoAllocate !== false,
                stamps, t,
            }));
        } catch (e) {
            if (e && e.httpStatus) return res.status(e.httpStatus).json({ message: e.message });
            throw e;
        }
        res.status(201).json({ message: `Official Receipt ${row.docNo} posted.`, id: row.id, docNo: row.docNo });
    } catch (err) {
        console.error('Error posting receipt:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/ar/debtors/:id/refunds - Refund, funded by a deposit's held
// balance (depositId) or by unallocated receipt credit.
exports.postRefund = async (req, res) => {
    try {
        const { error, companyId, debtor } = await loadDebtor(req);
        if (error) return res.status(error.status).json({ message: error.message });
        const dates = parseDates(req.body);
        if (dates.error) return res.status(400).json({ message: dates.error });
        const amountC = parseAmount(req.body.amount);
        if (!amountC) return res.status(400).json({ message: 'Amount must be greater than zero.' });

        let depositRow = null;
        const depositId = strOrNull(req.body.depositId);
        if (depositId) {
            depositRow = await Deposit.findOne({ where: { id: depositId, debtorId: debtor.id, status: 'open' } });
            if (!depositRow) return res.status(400).json({ message: 'Deposit not found (or not open) on this debtor.' });
        }

        const manualNo = strOrNull(req.body.docNo);
        const mode = await numberingGateway.getMode(req, 'ar-refund');
        if (mode !== 'auto' && manualNo && await receiptNoInUse(companyId, 'refund', manualNo)) {
            return res.status(409).json({ message: `Refund number '${manualNo}' is already in use.` });
        }
        if (mode === 'manual' && !manualNo) {
            return res.status(400).json({ message: 'Refund number is required (numbering is manual).' });
        }

        const placement = await getCallerPlacement(req);
        const stamps = ownershipStamps(req, placement);

        let row;
        try {
            row = await sequelize.transaction(async (t) => posting.postRefund({
                companyId, debtor,
                issueDocNo: docNoIssuer(req, 'ar-refund', manualNo),
                docDate: dates.docDate, trxDate: dates.trxDate,
                paymentMethod: strOrNull(req.body.paymentMethod),
                paymentRef: strOrNull(req.body.paymentRef),
                description: strOrNull(req.body.description),
                amountC, depositRow, stamps, t,
            }));
        } catch (e) {
            if (e && e.httpStatus) return res.status(e.httpStatus).json({ message: e.message });
            throw e;
        }
        res.status(201).json({ message: `Refund ${row.docNo} posted.`, id: row.id, docNo: row.docNo });
    } catch (err) {
        console.error('Error posting refund:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/ar/debtors/:id/deposits - open a Deposit (collection happens via
// Official Receipt against it).
exports.postDeposit = async (req, res) => {
    try {
        const { error, companyId, debtor } = await loadDebtor(req);
        if (error) return res.status(error.status).json({ message: error.message });
        const dates = parseDates(req.body);
        if (dates.error) return res.status(400).json({ message: dates.error });
        const amountC = parseAmount(req.body.amount);
        if (!amountC) return res.status(400).json({ message: 'Amount must be greater than zero.' });

        const manualNo = strOrNull(req.body.docNo);
        const mode = await numberingGateway.getMode(req, DEPOSIT_NUMBERING_PURPOSE);
        if (mode !== 'auto' && manualNo) {
            const clash = await Deposit.findOne({ where: { companyId, docNo: manualNo }, attributes: ['id'] });
            if (clash) return res.status(409).json({ message: `Deposit number '${manualNo}' is already in use.` });
        }
        if (mode === 'manual' && !manualNo) {
            return res.status(400).json({ message: 'Deposit number is required (numbering is manual).' });
        }

        const placement = await getCallerPlacement(req);
        const stamps = ownershipStamps(req, placement);
        const issue = docNoIssuer(req, DEPOSIT_NUMBERING_PURPOSE, manualNo);

        const row = await sequelize.transaction(async (t) => Deposit.create({
            companyId, debtorId: debtor.id,
            docNo: await issue(t),
            docDate: dates.docDate, trxDate: dates.trxDate,
            description: strOrNull(req.body.description),
            amount: posting.money(amountC),
            collectedAmount: 0, utilizedAmount: 0, status: 'open',
            ...stamps,
        }, { transaction: t }));
        res.status(201).json({ message: `Deposit ${row.docNo} opened.`, id: row.id, docNo: row.docNo });
    } catch (err) {
        console.error('Error opening deposit:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/ar/deposits/:id/convert - convert held deposit into a Credit Note
// that knocks off outstanding.
exports.convertDeposit = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const deposit = await Deposit.findOne({ where: { id: req.params.id, companyId } });
        if (!deposit) return res.status(404).json({ message: 'Deposit not found.' });
        const debtor = await Debtor.findOne({ where: { id: deposit.debtorId, companyId } });
        if (!debtor) return res.status(404).json({ message: 'Debtor not found.' });

        const dates = parseDates(req.body);
        if (dates.error) return res.status(400).json({ message: dates.error });
        const amountC = parseAmount(req.body.amount);
        if (!amountC) return res.status(400).json({ message: 'Amount must be greater than zero.' });

        const conversionType = await membershipGateway.ensureDepositConversionType(companyId);
        const placement = await getCallerPlacement(req);
        const stamps = ownershipStamps(req, placement);

        let cn;
        try {
            cn = await sequelize.transaction(async (t) => posting.convertDeposit({
                companyId, debtor, deposit, amountC,
                transactionTypeId: conversionType.id,
                issueDocNo: docNoIssuer(req, 'ar-credit-note', null),
                docDate: dates.docDate, trxDate: dates.trxDate,
                stamps, t,
            }));
        } catch (e) {
            if (e && e.httpStatus) return res.status(e.httpStatus).json({ message: e.message });
            throw e;
        }
        res.status(201).json({ message: `Deposit ${deposit.docNo} converted - Credit Note ${cn.docNo} posted.`, id: cn.id, docNo: cn.docNo });
    } catch (err) {
        console.error('Error converting deposit:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---------------------------------------------------------------------------
// Void endpoints. Ledger debit -> reversal row; others -> guarded flips.

exports.voidLedger = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await Ledger.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Document not found.' });
        const debtor = await Debtor.findOne({ where: { id: row.debtorId, companyId } });
        if (!debtor) return res.status(404).json({ message: 'Debtor not found.' });

        const dates = parseDates({ docDate: str(req.body.docDate) || row.docDate, trxDate: strOrNull(req.body.trxDate) });
        if (dates.error) return res.status(400).json({ message: dates.error });

        const kind = LEDGER_DOC_KINDS.find((k) => k.key === row.docKind);
        const placement = await getCallerPlacement(req);
        const stamps = ownershipStamps(req, placement);

        let reversal = null;
        try {
            reversal = await sequelize.transaction(async (t) => posting.voidLedgerDoc({
                companyId, debtor, row,
                issueDocNo: docNoIssuer(req, kind.numberingPurpose, null),
                docDate: dates.docDate, trxDate: dates.trxDate,
                stamps, t,
            }));
        } catch (e) {
            if (e && e.httpStatus) return res.status(e.httpStatus).json({ message: e.message });
            throw e;
        }
        res.status(200).json({
            message: reversal
                ? `${kind.label} ${row.docNo} voided (reversal ${reversal.docNo}).`
                : `${kind.label} ${row.docNo} voided.`,
        });
    } catch (err) {
        console.error('Error voiding ledger document:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.voidReceipt = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await Receipt.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Receipt not found.' });

        const placement = await getCallerPlacement(req);
        const stamps = ownershipStamps(req, placement);
        try {
            await sequelize.transaction(async (t) => posting.voidReceipt({ companyId, row, stamps, t }));
        } catch (e) {
            if (e && e.httpStatus) return res.status(e.httpStatus).json({ message: e.message });
            throw e;
        }
        res.status(200).json({ message: `Official Receipt ${row.docNo} voided.` });
    } catch (err) {
        console.error('Error voiding receipt:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.voidDeposit = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await Deposit.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Deposit not found.' });

        const placement = await getCallerPlacement(req);
        const stamps = ownershipStamps(req, placement);
        try {
            await sequelize.transaction(async (t) => posting.voidDeposit({ row, stamps, t }));
        } catch (e) {
            if (e && e.httpStatus) return res.status(e.httpStatus).json({ message: e.message });
            throw e;
        }
        res.status(200).json({ message: `Deposit ${row.docNo} voided.` });
    } catch (err) {
        console.error('Error voiding deposit:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};
