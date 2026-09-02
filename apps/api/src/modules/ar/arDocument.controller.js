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
// Multicurrency (step 3): documents are in the ACCOUNT currency; drafts
// freeze their rate at save (keyed, else the rate table at docDate).
const arCurrency = require('./arCurrency.service');
// Financial-analysis dimensions (shared Dimension capability, 2026-08-25):
// manual entries stamp the slot-assigned categories' options onto
// analysis<N>Id through the seam - never the dimension models directly.
// Every gateway read is scoped to AR's own module name (2026-08-27): a company
// can run a dimension on Golf or POS without it ever reaching an AR clerk.
const dimensionGateway = require('../../platform/dimensionGateway');
const AR_MODULE = 'Account Receivable';

// The rate resolution for a draft/entry body: { fx } or { error } (a 400
// message naming what to do - no rate in the table, malformed keyed rate).
async function readFx(companyId, debtor, docDate, body) {
    try {
        const fx = await arCurrency.resolveDocumentFx({ companyId, debtor, docDate, requestedRate: body.exchangeRate });
        return { fx };
    } catch (e) {
        if (e && e.httpStatus) return { error: e.message };
        throw e;
    }
}

// The fx fields every document DTO ships (listing rows, account books).
function fxDto(r) {
    return { currencyCode: r.currencyCode, exchangeRate: r.exchangeRate };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SYNTHETIC_PREFIX = {
    'ar-invoice': 'INV', 'ar-debit-note': 'DN', 'ar-credit-note': 'CN',
    'ar-interest': 'INT', 'ar-receipt': 'OR', 'ar-refund': 'RF', 'ar-deposit': 'DEP',
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

        // Account currency (multicurrency step 2): shipped with the gate so the
        // screen labels balances only when the company actually runs more
        // than one currency.
        const { getMultiCurrencyState, effectiveCurrency } = require('./arCurrency.service');
        const currencyState = await getMultiCurrencyState(req, companyId);

        res.status(200).json({
            multiCurrencyEnabled: currencyState.enabled,
            debtor: {
                id: debtor.id, debtorType: debtor.debtorType, sourceId: debtor.sourceId,
                no, name, terms: debtor.terms, sendReminders: debtor.sendReminders,
                chargeInterest: debtor.chargeInterest, status: debtor.status,
                currencyCode: effectiveCurrency(debtor.currencyCode, currencyState.baseCurrencyCode),
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
                balanceAmount: r.balanceAmount, status: r.status, reversalOfId: r.reversalOfId,
                voidReason: r.voidReason,
                ...fxDto(r), baseGrossAmount: r.baseGrossAmount,
            })),
            receipts: receipts.map((r) => ({
                id: r.id, docKind: r.docKind, mode: r.mode, docNo: r.docNo,
                docDate: r.docDate, trxDate: r.trxDate,
                paymentMethod: r.paymentMethod, paymentRef: r.paymentRef, description: r.description,
                amount: r.amount, balanceAmount: r.balanceAmount, status: r.status,
                ...fxDto(r), baseAmount: r.baseAmount,
            })),
            deposits: deposits.map((d) => ({
                id: d.id, docNo: d.docNo, docDate: d.docDate, trxDate: d.trxDate,
                description: d.description, amount: d.amount,
                balanceAmount: d.balanceAmount, heldAmount: d.heldAmount, status: d.status,
                ...fxDto(d), baseAmount: d.baseAmount,
            })),
        });
    } catch (err) {
        console.error('Error loading debtor account:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/ar/debtors/:id/account/meta - the entry dialogs' pickers: billing
// items (Transaction Types) and numbering modes per document series. (The
// persons list was dropped 2026-08-20 with the manual Incurred-by picker -
// incurredBy is stamped only by producer modules at the posting seam.)
exports.getAccountMeta = async (req, res) => {
    try {
        const { error, companyId, debtor } = await loadDebtor(req);
        if (error) return res.status(error.status).json({ message: error.message });

        const purposes = ['ar-invoice', 'ar-debit-note', 'ar-credit-note', 'ar-receipt', 'ar-refund', 'ar-deposit'];
        const modes = {};
        for (const p of purposes) modes[p] = await numberingGateway.getMode(req, p);

        // Whether an ar-invoice approval chain is active decides the entry
        // dialog's button label: "Submit for Approval" vs "Submit".
        const workflowGateway = require('../../platform/workflowGateway');
        const ArTransactionType = require('./transactionType.model');
        const types = await ArTransactionType.findAll({
            where: { companyId, isActive: true },
            order: [['transactionType', 'ASC']],
            attributes: ['id', 'transactionType', 'trxClass', 'description', 'taxSchemeCode', 'isInterestChargeable'],
        });
        // The debtor's OPEN DEBITS - the CN entry's "Apply against" choices
        // (the account screen has its own ledger; the standalone CN dialog
        // reads them from here after picking the debtor).
        const openDebits = await Ledger.findAll({
            where: { debtorId: debtor.id, mode: 'debit', status: 'open' },
            order: [['docDate', 'ASC'], ['createdAt', 'ASC']],
            attributes: ['id', 'docKind', 'docNo', 'grossAmount', 'balanceAmount'],
        });
        // The debtor's OPEN DEPOSITS, with both counters: the Receipt dialog
        // offers those with balanceAmount > 0 (still collectable) and the
        // Refund dialog those with heldAmount > 0 (refundable) - each dialog
        // filters client-side.
        const openDeposits = await Deposit.findAll({
            where: { debtorId: debtor.id, status: 'open' },
            order: [['docDate', 'ASC'], ['createdAt', 'ASC']],
            attributes: ['id', 'docNo', 'amount', 'balanceAmount', 'heldAmount'],
        });
        // Account currency for the entry dialogs (multicurrency step 3): the
        // code, the base, and - for a FOREIGN account - the currency's rate
        // history so the Exchange rate field defaults per document date
        // client-side (the server re-resolves when none is keyed).
        const fxState = await arCurrency.getMultiCurrencyState(req, companyId);
        const accountCurrency = arCurrency.effectiveCurrency(debtor.currencyCode, fxState.baseCurrencyCode);
        const isBase = !accountCurrency || !fxState.baseCurrencyCode || accountCurrency === fxState.baseCurrencyCode;
        const currency = {
            code: accountCurrency,
            baseCurrencyCode: fxState.baseCurrencyCode,
            isBase,
            rates: isBase ? [] : await arCurrency.listRates(companyId, accountCurrency),
        };
        res.status(200).json({
            currency,
            // Slot-assigned analysis dimensions + their options - the entry
            // dialogs render one picker per entry here (none assigned = none).
            analysis: await dimensionGateway.entryMeta(companyId, AR_MODULE),
            // The AR-OWNED catalog (2026-08-15) with trxClass, so each entry
            // dialog offers only its own document book's types.
            transactionTypes: types.map((t) => t.toJSON()),
            numberingModes: modes,
            invoiceApproval: await workflowGateway.hasActiveWorkflow(req, 'ar-invoice'),
            creditNoteApproval: await workflowGateway.hasActiveWorkflow(req, 'ar-credit-note'),
            debitNoteApproval: await workflowGateway.hasActiveWorkflow(req, 'ar-debit-note'),
            refundApproval: await workflowGateway.hasActiveWorkflow(req, 'ar-refund'),
            depositApproval: await workflowGateway.hasActiveWorkflow(req, 'ar-deposit'),
            openDebits: openDebits.map((d) => ({
                id: d.id, docKind: d.docKind, docNo: d.docNo,
                grossAmount: d.grossAmount, balanceAmount: d.balanceAmount,
            })),
            openDeposits: openDeposits.map((d) => ({
                id: d.id, docNo: d.docNo, amount: d.amount, balanceAmount: d.balanceAmount, heldAmount: d.heldAmount,
            })),
        });
    } catch (err) {
        console.error('Error loading debtor account meta:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/ar/documents/:type/:id/allocations - a document's allocation rows
// (both directions), for the drill-down. Counterpart document numbers and the
// Forex designation names are resolved server-side so the viewer needs no
// follow-up lookups.
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

        // Resolve every involved document's number ('receipt' and 'refund'
        // sides are both ar.Receipt rows) and the fx designation names.
        const ids = { ledger: new Set(), receipt: new Set(), deposit: new Set() };
        const bucketOf = (t) => (t === 'ledger' ? ids.ledger : t === 'deposit' ? ids.deposit : ids.receipt);
        const fxTypeIds = new Set();
        for (const a of rows) {
            bucketOf(a.creditDocType).add(a.creditDocId);
            bucketOf(a.debitDocType).add(a.debitDocId);
            if (a.fxTransactionTypeId) fxTypeIds.add(a.fxTransactionTypeId);
        }
        const Deposit = require('./deposit.model');
        const TransactionType = require('./transactionType.model');
        const [ledgerDocs, receiptDocs, depositDocs, fxTypes] = await Promise.all([
            ids.ledger.size ? Ledger.findAll({ where: { id: { [Op.in]: [...ids.ledger] } }, attributes: ['id', 'docNo', 'docKind'] }) : [],
            ids.receipt.size ? Receipt.findAll({ where: { id: { [Op.in]: [...ids.receipt] } }, attributes: ['id', 'docNo', 'docKind'] }) : [],
            ids.deposit.size ? Deposit.findAll({ where: { id: { [Op.in]: [...ids.deposit] } }, attributes: ['id', 'docNo'] }) : [],
            fxTypeIds.size ? TransactionType.findAll({ where: { id: { [Op.in]: [...fxTypeIds] } }, attributes: ['id', 'transactionType'] }) : [],
        ]);
        const docNoById = new Map();
        for (const d of [...ledgerDocs, ...receiptDocs, ...depositDocs]) docNoById.set(d.id, { docNo: d.docNo, docKind: d.docKind || 'deposit' });
        const fxTypeById = new Map(fxTypes.map((t) => [t.id, t.transactionType]));

        // FULL deposit usage trail (2026-09-01): the deposit viewer follows
        // the money one hop further than the direct allocation web -
        //   1. each deposit->refund draw continues through the refund's
        //      OFFSET Credit Note (sourceRef = the refund's id) to the
        //      documents that CN settled;
        //   2. direct conversions (the Convert button's DEPCONV CNs carry
        //      sourceRef = THIS deposit's id and write NO allocation row)
        //      appear as their own entries with their settlements.
        // Other document types keep the plain allocation list.
        const onwardByAllocId = new Map(); // allocation id -> { via, settled[] }
        let conversions;
        if (type === 'deposit') {
            const refundIds = rows.filter((a) => a.debitDocType === 'refund').map((a) => a.debitDocId);
            const [offsetCns, convCns] = await Promise.all([
                refundIds.length ? Ledger.findAll({
                    where: { companyId, docKind: 'credit-note', mode: 'credit', sourceModule: 'ar', sourceRef: { [Op.in]: refundIds } },
                    attributes: ['id', 'docNo', 'sourceRef'],
                }) : [],
                Ledger.findAll({
                    where: { companyId, docKind: 'credit-note', mode: 'credit', sourceModule: 'ar', sourceRef: req.params.id },
                    attributes: ['id', 'docNo', 'grossAmount', 'balanceAmount', 'status', 'createdAt'],
                    order: [['createdAt', 'ASC']],
                }),
            ]);
            const cnIds = [...offsetCns, ...convCns].map((c) => c.id);
            const cnAllocs = cnIds.length ? await Allocation.findAll({
                where: { companyId, creditDocType: 'ledger', creditDocId: { [Op.in]: cnIds } },
                order: [['createdAt', 'ASC']],
            }) : [];
            const settledIds = [...new Set(cnAllocs.map((a) => a.debitDocId))];
            const settledDocs = settledIds.length ? await Ledger.findAll({
                where: { id: { [Op.in]: settledIds } },
                attributes: ['id', 'docNo', 'docKind'],
            }) : [];
            const settledById = new Map(settledDocs.map((d) => [d.id, d]));
            const settledOf = (cnId) => cnAllocs.filter((a) => a.creditDocId === cnId).map((a) => ({
                docNo: (settledById.get(a.debitDocId) || {}).docNo || null,
                docKind: (settledById.get(a.debitDocId) || {}).docKind || 'ledger',
                amount: a.amount,
            }));
            const cnByRefund = new Map(offsetCns.map((c) => [c.sourceRef, c]));
            for (const a of rows) {
                if (a.debitDocType !== 'refund') continue;
                const cn = cnByRefund.get(a.debitDocId);
                if (cn) onwardByAllocId.set(a.id, { via: cn.docNo, settled: settledOf(cn.id) });
            }
            conversions = convCns.map((c) => ({
                id: c.id,
                docNo: c.docNo,
                amount: c.grossAmount,
                // Remaining CN credit that has not (yet) settled anything.
                unallocated: c.balanceAmount,
                status: c.status,
                settled: settledOf(c.id),
                createdAt: c.createdAt,
            }));
        }

        res.status(200).json({
            allocations: rows.map((a) => ({
                id: a.id,
                creditDocType: a.creditDocType,
                creditDocId: a.creditDocId,
                creditDoc: docNoById.get(a.creditDocId) || null,
                debitDocType: a.debitDocType,
                debitDocId: a.debitDocId,
                debitDoc: docNoById.get(a.debitDocId) || null,
                amount: a.amount,
                fxGainLoss: a.fxGainLoss,
                fxTransactionType: a.fxTransactionTypeId ? (fxTypeById.get(a.fxTransactionTypeId) || null) : null,
                createdAt: a.createdAt,
                ...(onwardByAllocId.has(a.id) ? {
                    onwardVia: onwardByAllocId.get(a.id).via,
                    onward: onwardByAllocId.get(a.id).settled,
                } : {}),
            })),
            ...(type === 'deposit' ? { conversions } : {}),
        });
    } catch (err) {
        console.error('Error loading allocations:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/ar/documents/:type/:id/tax-lines - the FROZEN per-component tax
// breakdown behind a Ledger document (ar.TaxLedger: written at save, replaced
// on draft edit, copied by void reversals, never requoted). The rows' docType
// mirrors the document's docKind and their status mirrors its lifecycle, so
// this is the drill-down for tax verification and reporting. docId alone
// identifies the document; :type stays in the URL for shape-consistency with
// the allocations drill-down.
exports.getTaxLines = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const TaxLedger = require('./taxLedger.model');
        const rows = await TaxLedger.findAll({
            where: { companyId, docId: req.params.id },
            order: [['lineNo', 'ASC']],
        });
        res.status(200).json({ taxLines: rows });
    } catch (err) {
        console.error('Error loading tax lines:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---------------------------------------------------------------------------
// AR Transaction screens (one menu per document type - /ar/invoices first).
// Each type gets its own listing + entry door so RBAC can grant, e.g., invoice
// entry without credit-note authority; the Debtor Account screen remains the
// account-first inquiry surface sharing the same posting flows.

// Resolve debtor display (no/name) for a batch of debtor rows - the same
// seam-based resolution the Debtor Listing uses.
async function debtorDisplayMap(companyId, debtors) {
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
        let p = null;
        if (d.debtorType === 'membership') p = display.memberships[d.sourceId];
        else if (d.debtorType === 'member') p = display.members[d.sourceId];
        else {
            const o = otherById.get(d.sourceId);
            if (o) p = { no: o.code, name: o.name };
        }
        out.set(d.id, { id: d.id, debtorType: d.debtorType, no: p ? p.no : null, name: p ? p.name : null });
    }
    return out;
}

const LIST_LIMIT = 50;

// GET /api/ar/<type route> - cross-debtor listing of one ledger document kind
// (month + docNo/description search + status filter, newest first).
function makeLedgerListHandler(docKind) {
    return async (req, res) => {
        try {
            const { companyId } = getUserContext(req);
            if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

            const where = { companyId, docKind };
            const month = str(req.query.month);
            if (/^\d{4}-\d{2}$/.test(month)) {
                const [y, m] = month.split('-').map(Number);
                const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
                where.docDate = { [Op.gte]: `${month}-01`, [Op.lte]: `${month}-${String(last).padStart(2, '0')}` };
            }
            // Filter keys follow the DISPLAY vocabulary: 'draft' ("Open"),
            // 'pending-approval', 'posted' (= internal open|settled), 'void'.
            const status = str(req.query.status);
            if (status === 'posted') where.status = { [Op.in]: ['open', 'settled'] };
            else if (['draft', 'pending-approval', 'open', 'settled', 'void'].includes(status)) where.status = status;
            const q = str(req.query.q);
            if (q) {
                where[Op.or] = [
                    { docNo: { [Op.iLike]: `%${q}%` } },
                    { description: { [Op.iLike]: `%${q}%` } },
                ];
            }
            const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

            const { rows, count } = await Ledger.findAndCountAll({
                where,
                order: [['docDate', 'DESC'], ['createdAt', 'DESC']],
                limit: LIST_LIMIT,
                offset,
            });

            const debtorIds = [...new Set(rows.map((r) => r.debtorId))];
            const debtors = debtorIds.length
                ? await Debtor.findAll({ where: { id: { [Op.in]: debtorIds }, companyId } })
                : [];
            const displayByDebtor = await debtorDisplayMap(companyId, debtors);
            // Data scope per row (own/department/all) - the UI hides Edit /
            // Submit / Void on drafts outside the caller's scope.
            const { annotateCanModify, getCompanyBaseCurrency } = require('../../platform/serviceContext');
            const canModify = await annotateCanModify(req, rows);

            res.status(200).json({
                total: count,
                limit: LIST_LIMIT,
                offset,
                // Rows in another currency get a chip client-side (step 5).
                baseCurrencyCode: await getCompanyBaseCurrency(companyId),
                documents: rows.map((r, i) => ({
                    id: r.id, docKind: r.docKind, mode: r.mode, docNo: r.docNo,
                    docDate: r.docDate, trxDate: r.trxDate, dueDate: r.dueDate,
                    description: r.description, sourceModule: r.sourceModule,
                    netAmount: r.netAmount, taxAmount: r.taxAmount, grossAmount: r.grossAmount,
                    balanceAmount: r.balanceAmount, status: r.status,
                    voidReason: r.voidReason,
                    ...fxDto(r), baseGrossAmount: r.baseGrossAmount,
                    // Draft edit prefill (the shared dialog re-opens the form;
                    // applyToLedgerId = a CN draft's allocation intent;
                    // analysis ids resolve against the dialog's meta).
                    ...dimensionGateway.copyColumns(r),
                    transactionTypeId: r.transactionTypeId,
                    applyToLedgerId: r.applyToLedgerId,
                    canModify: canModify[i],
                    debtor: displayByDebtor.get(r.debtorId) || { id: r.debtorId, debtorType: null, no: null, name: null },
                })),
            });
        } catch (err) {
            console.error(`Error listing ${docKind} documents:`, err);
            res.status(500).json({ message: 'Internal server error' });
        }
    };
}

exports.listInvoices = makeLedgerListHandler('invoice');
exports.listCreditNotes = makeLedgerListHandler('credit-note');
exports.listDebitNotes = makeLedgerListHandler('debit-note');

// ---------------------------------------------------------------------------
// Invoice lifecycle (defined 2026-08-13): Save -> 'draft' ("Open" on screen,
// editable, voidable, NOT financial) -> Submit -> posted directly, or through
// the ar-invoice approval chain ('pending-approval' until the outcome).
// Posted invoices are immutable: corrected with a Credit Note, never voided.

// The manual document kinds that follow the Save -> Submit draft lifecycle
// (invoice since 2026-08-13; credit-note adopted it 2026-08-20; debit-note
// closed the set 2026-09-01 - its old immediate posting is gone). Each keys
// its own numbering series, workflow purpose and catalog class.
const LIFECYCLE_KINDS = {
    invoice: {
        docKind: 'invoice', mode: 'debit', label: 'Invoice',
        numberingPurpose: 'ar-invoice', workflowPurpose: 'ar-invoice', trxClass: 'invoice',
    },
    'debit-note': {
        docKind: 'debit-note', mode: 'debit', label: 'Debit Note',
        numberingPurpose: 'ar-debit-note', workflowPurpose: 'ar-debit-note', trxClass: 'debit-note',
    },
    'credit-note': {
        docKind: 'credit-note', mode: 'credit', label: 'Credit Note',
        numberingPurpose: 'ar-credit-note', workflowPurpose: 'ar-credit-note', trxClass: 'credit-note',
    },
};

// Validate + tax-quote the draft's editable fields (shared by create + edit).
// Tax is quoted at save with onDate = docDate - schemes are effective-dated,
// so the snapshot is deterministic and posting needs no re-quote.
async function readDraftFields(req, companyId, debtor, lk) {
    const dates = parseDates(req.body);
    if (dates.error) return { error: dates.error };
    const amountC = parseAmount(req.body.amount);
    if (!amountC) return { error: 'Amount must be greater than zero.' };

    // AR's own catalog; each document book takes its own class's entries only.
    const ArTransactionType = require('./transactionType.model');
    const txnType = await ArTransactionType.findOne({ where: { companyId, id: str(req.body.transactionTypeId) || null } });
    if (!txnType || !txnType.isActive) return { error: 'Select a transaction type.' };
    if (txnType.trxClass !== lk.trxClass) return { error: `This transaction type is not a ${lk.label}-class item.` };

    // Credit Note allocation INTENT (resolved at posting, not at save): the
    // target must be an open debit of THIS debtor right now - the posting-time
    // re-check tolerates it settling in between. No FIFO for adjustments
    // (user rule 2026-08-20): an adjustment always knows its document.
    let applyToLedgerId = null;
    let cnTarget = null;
    if (lk.docKind === 'credit-note') {
        applyToLedgerId = strOrNull(req.body.targetLedgerId);
        if (applyToLedgerId) {
            cnTarget = await Ledger.findOne({
                where: { id: applyToLedgerId, debtorId: debtor.id, mode: 'debit', status: 'open' },
                attributes: ['id', 'docNo', 'grossAmount', 'balanceAmount'],
            });
            if (!cnTarget) return { error: 'The target document is not an open debit of this debtor.' };
        }
    }

    let amounts = { netC: amountC, taxC: 0, grossC: amountC, taxSchemeCode: null, taxRate: null };
    let taxQuote = null; // full quote (per-component lines) frozen into ar.TaxLedger
    if (txnType.taxSchemeCode) {
        const q = await quoteTax(req, { taxSchemeCode: txnType.taxSchemeCode, amount: amountC / 100, onDate: dates.docDate });
        if (!q) return { error: `Tax scheme '${txnType.taxSchemeCode}' could not be resolved for this company.` };
        taxQuote = q;
        amounts = {
            netC: posting.cents(q.net),
            taxC: posting.cents(q.taxTotal),
            grossC: posting.cents(q.gross),
            taxSchemeCode: txnType.taxSchemeCode,
            taxRate: q.lines.reduce((s, l) => s + Number(l.taxRate || 0), 0).toFixed(4),
        };
    }

    // A targeted CN must not exceed the target's remaining balance (user rule
    // 2026-08-20) - checked GROSS (tax included), since the gross is what
    // allocates. Untargeted CNs stay uncapped (available credit).
    if (cnTarget) {
        const remainingC = posting.cents(cnTarget.balanceAmount);
        if (amounts.grossC > remainingC) {
            return { error: `Credit note amount (gross ${posting.money(amounts.grossC)}) exceeds the balance of ${cnTarget.docNo} (${posting.money(remainingC)}).` };
        }
    }

    // Exchange rate frozen at save (keyed, else the table at docDate).
    const fxRead = await readFx(companyId, debtor, dates.docDate, req.body);
    if (fxRead.error) return { error: fxRead.error };

    // Analysis selections ({ "<dimensionNo>": optionId }) validated against the
    // dimensions AR applies to; required dimensions enforced on manual entry.
    const analysisRead = await dimensionGateway.readSelections(companyId, req.body, AR_MODULE);
    if (analysisRead.error) return { error: analysisRead.error };
    return { dates, txnType, amounts, applyToLedgerId, fx: fxRead.fx, taxQuote, analysisColumns: analysisRead.columns };
}

// Manual-number pre-checks for a draft (auto mode issues in-tx at save).
async function readDraftDocNo(req, companyId, lk, { ignoreId = null } = {}) {
    const manualNo = strOrNull(req.body.docNo);
    const mode = await numberingGateway.getMode(req, lk.numberingPurpose);
    if (mode === 'manual' && !manualNo) return { error: `${lk.label} number is required (numbering is manual).` };
    if (mode !== 'auto' && manualNo) {
        const clash = await Ledger.findOne({
            where: { companyId, docKind: lk.docKind, docNo: manualNo, ...(ignoreId ? { id: { [Op.ne]: ignoreId } } : {}) },
            attributes: ['id'],
        });
        if (clash) return { error: `${lk.label} number '${manualNo}' is already in use.` };
    }
    return { mode, manualNo };
}

// Create the draft row (both doors call this: the per-document screen with
// debtorId in the body, the Debtor Account door via postLedger below).
// GAPLESS RULE (firmed up 2026-08-14): the number is issued INSIDE this
// transaction - the counter's row lock serialises concurrent users (no
// duplicates) and rolls back with a failed save (no burned numbers). A later
// void keeps the number, explained by the void audit trail.
async function createDraft(req, res, companyId, debtor, lk) {
    const fields = await readDraftFields(req, companyId, debtor, lk);
    if (fields.error) return res.status(400).json({ message: fields.error });
    const no = await readDraftDocNo(req, companyId, lk);
    if (no.error) return res.status(no.error.includes('already in use') ? 409 : 400).json({ message: no.error });

    const placement = await getCallerPlacement(req);
    const stamps = ownershipStamps(req, placement);
    const issue = docNoIssuer(req, lk.numberingPurpose, no.manualNo);
    const taxLedger = require('./taxLedger.service');
    const row = await sequelize.transaction(async (t) => {
        const created = await Ledger.create({
        companyId,
        debtorId: debtor.id,
        docKind: lk.docKind,
        mode: lk.mode,
        docNo: await issue(t),
        docDate: fields.dates.docDate,
        trxDate: fields.dates.trxDate,
        dueDate: null, // computed from the debtor's terms at posting
        transactionTypeId: fields.txnType.id,
        description: strOrNull(req.body.description),
        // Manual AR documents belong to the ACCOUNT itself (user rule
        // 2026-08-20): incurredBy is stamped only by producer modules via
        // arGateway.postCharge - a nominee's charge is keyed on the
        // nominee's own debtor account, never "on behalf of".
        incurredByMemberId: null,
        sourceModule: 'ar',
        sourceRef: 'manual',
        applyToLedgerId: fields.applyToLedgerId,
        netAmount: posting.money(fields.amounts.netC),
        taxSchemeCode: fields.amounts.taxSchemeCode,
        taxRate: fields.amounts.taxRate,
        taxAmount: posting.money(fields.amounts.taxC),
        grossAmount: posting.money(fields.amounts.grossC),
        ...arCurrency.ledgerFxColumns(fields.fx, fields.amounts),
        isInterestChargeable: lk.mode === 'debit' && fields.txnType.isInterestChargeable === true,
        balanceAmount: posting.money(fields.amounts.grossC),
        ...fields.analysisColumns,
        status: 'draft',
        ...stamps,
        }, { transaction: t });
        // Freeze the quote's per-component breakdown WITH the tax snapshot
        // (Save-time rule, 2026-08-24) - the lines explain taxAmount.
        await taxLedger.replaceTaxLines({ companyId, row: created, quote: fields.taxQuote, stamps, t });
        return created;
    });
    res.status(201).json({ message: `${lk.label} ${row.docNo} saved as Open.`, id: row.id, docNo: row.docNo });
}

// POST /api/ar/<kind route> - save a new draft (debtorId in the body; each
// screen's grant is kind-specific by construction).
function makeCreateDoor(lk) {
    return async (req, res) => {
        try {
            const { companyId } = getUserContext(req);
            if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
            const debtor = await Debtor.findOne({ where: { id: str(req.body.debtorId), companyId } });
            if (!debtor) return res.status(404).json({ message: 'Debtor not found.' });
            return await createDraft(req, res, companyId, debtor, lk);
        } catch (err) {
            console.error(`Error saving ${lk.label.toLowerCase()} draft:`, err);
            res.status(500).json({ message: 'Internal server error' });
        }
    };
}
exports.postInvoice = makeCreateDoor(LIFECYCLE_KINDS.invoice);
exports.postCreditNote = makeCreateDoor(LIFECYCLE_KINDS['credit-note']);
exports.postDebitNote = makeCreateDoor(LIFECYCLE_KINDS['debit-note']);

// Load a lifecycle document row + its debtor, enforcing the caller's data
// scope (own / department / all - "the user or their superior").
async function loadOwnedDoc(req, res, lk) {
    const { companyId } = getUserContext(req);
    if (!companyId) { res.status(400).json({ message: 'Select a workspace first.' }); return null; }
    const row = await Ledger.findOne({ where: { id: req.params.id, companyId, docKind: lk.docKind } });
    if (!row) { res.status(404).json({ message: `${lk.label} not found.` }); return null; }
    const { canModifyRecord } = require('../../platform/serviceContext');
    if (!(await canModifyRecord(req, row))) {
        res.status(403).json({ message: `This ${lk.label.toLowerCase()} belongs to another user (outside your data scope).` });
        return null;
    }
    const debtor = await Debtor.findOne({ where: { id: row.debtorId, companyId } });
    if (!debtor) { res.status(404).json({ message: 'Debtor not found.' }); return null; }
    return { companyId, row, debtor };
}

// PATCH /api/ar/<kind route>/:id - edit a draft (drafts only; posted is immutable).
function makeUpdateDraft(lk) {
    return async (req, res) => {
    try {
        const loaded = await loadOwnedDoc(req, res, lk);
        if (!loaded) return;
        const { companyId, row, debtor } = loaded;
        if (row.status !== 'draft') {
            return res.status(400).json({ message: `Only an Open (draft) ${lk.label.toLowerCase()} can be edited (this one is ${row.status}).` });
        }
        const fields = await readDraftFields(req, companyId, debtor, lk);
        if (fields.error) return res.status(400).json({ message: fields.error });
        const no = await readDraftDocNo(req, companyId, lk, { ignoreId: row.id });
        if (no.error) return res.status(no.error.includes('already in use') ? 409 : 400).json({ message: no.error });

        Object.assign(row, {
            // An auto-issued number is immutable (gapless series); a manual
            // number may be corrected while still a draft.
            docNo: no.mode === 'auto' ? row.docNo : (no.manualNo || row.docNo),
            docDate: fields.dates.docDate,
            trxDate: fields.dates.trxDate,
            transactionTypeId: fields.txnType.id,
            description: strOrNull(req.body.description),
            incurredByMemberId: null, // manual documents belong to the account itself
            applyToLedgerId: fields.applyToLedgerId,
            netAmount: posting.money(fields.amounts.netC),
            taxSchemeCode: fields.amounts.taxSchemeCode,
            taxRate: fields.amounts.taxRate,
            taxAmount: posting.money(fields.amounts.taxC),
            grossAmount: posting.money(fields.amounts.grossC),
            // A draft has no allocations, so its balance tracks its gross.
            balanceAmount: posting.money(fields.amounts.grossC),
            ...arCurrency.ledgerFxColumns(fields.fx, fields.amounts),
            ...fields.analysisColumns,
            isInterestChargeable: lk.mode === 'debit' && fields.txnType.isInterestChargeable === true,
            updatedBy: getUserContext(req).userId,
        });
        const taxLedger = require('./taxLedger.service');
        const placement = await getCallerPlacement(req);
        const stamps = ownershipStamps(req, placement);
        await sequelize.transaction(async (t) => {
            await row.save({ transaction: t });
            // Re-freeze the breakdown with the re-quoted snapshot (a switch to
            // a tax-free type clears the stale lines).
            await taxLedger.replaceTaxLines({ companyId, row, quote: fields.taxQuote, stamps, t });
        });
        res.status(200).json({ message: `${lk.label} draft updated.`, id: row.id, docNo: row.docNo });
    } catch (err) {
        console.error(`Error updating ${lk.label.toLowerCase()} draft:`, err);
        res.status(500).json({ message: 'Internal server error' });
    }
    };
}
exports.updateInvoiceDraft = makeUpdateDraft(LIFECYCLE_KINDS.invoice);
exports.updateCreditNoteDraft = makeUpdateDraft(LIFECYCLE_KINDS['credit-note']);
exports.updateDebitNoteDraft = makeUpdateDraft(LIFECYCLE_KINDS['debit-note']);

// POST /api/ar/<kind route>/:id/submit - make the draft financial: through
// the kind's approval chain when one is active (-> 'pending-approval'), else
// posted immediately (a CN then resolves its stored allocation intent).
function makeSubmit(lk) {
    return async (req, res) => {
    try {
        const loaded = await loadOwnedDoc(req, res, lk);
        if (!loaded) return;
        const { companyId, row, debtor } = loaded;
        if (row.status !== 'draft') {
            return res.status(400).json({ message: `Only an Open (draft) ${lk.label.toLowerCase()} can be submitted (this one is ${row.status}).` });
        }
        const mode = await numberingGateway.getMode(req, lk.numberingPurpose);
        if (mode === 'manual' && !row.docNo) {
            return res.status(400).json({ message: `${lk.label} number is required before submitting (numbering is manual).` });
        }

        const placement = await getCallerPlacement(req);
        const stamps = ownershipStamps(req, placement);
        const display = await debtorDisplayMap(companyId, [debtor]);
        const who = display.get(debtor.id) || {};
        const workflowGateway = require('../../platform/workflowGateway');

        let outcome;
        await sequelize.transaction(async (t) => {
            const wf = await workflowGateway.startWorkflow(req, lk.workflowPurpose, {
                entityId: row.id,
                entityLabel: `${lk.label} ${row.docNo || 'draft'} — ${who.name || who.no || 'debtor'} (${posting.money(posting.cents(row.grossAmount))})`,
                context: {
                    amount: Number(row.grossAmount),
                    debtorType: debtor.debtorType,
                    debtorNo: who.no || null,
                },
                transaction: t,
            });
            if (wf) {
                row.status = 'pending-approval';
                row.workflowInstanceId = wf.instanceId;
                row.updatedBy = stamps.updatedBy;
                await row.save({ transaction: t });
                await require('./taxLedger.service').syncStatus({ docType: row.docKind, docId: row.id, status: row.status, t });
                outcome = { pending: true };
                return;
            }
            await posting.postDraftLedger({
                companyId, debtor, row,
                issueDocNo: docNoIssuer(req, lk.numberingPurpose, row.docNo),
                stamps, t,
            });
            outcome = { pending: false };
        });
        res.status(200).json(outcome.pending
            ? { message: `${lk.label} submitted for approval.`, id: row.id, status: row.status }
            : { message: `${lk.label} ${row.docNo} posted.`, id: row.id, docNo: row.docNo, status: row.status });
    } catch (err) {
        if (err && err.httpStatus) return res.status(err.httpStatus).json({ message: err.message });
        console.error(`Error submitting ${lk.label.toLowerCase()}:`, err);
        res.status(500).json({ message: 'Internal server error' });
    }
    };
}
exports.submitInvoice = makeSubmit(LIFECYCLE_KINDS.invoice);
exports.submitCreditNote = makeSubmit(LIFECYCLE_KINDS['credit-note']);
exports.submitDebitNote = makeSubmit(LIFECYCLE_KINDS['debit-note']);

// PATCH /api/ar/<kind route>/:id/void - drafts only (audit kept, no reversal;
// the draft never touched a balance). Posted documents stay immutable;
// pending approvals must complete (or be recalled) first.
function makeVoid(lk) {
    return async (req, res) => {
        try {
            const loaded = await loadOwnedDoc(req, res, lk);
            if (!loaded) return;
            const { row } = loaded;
            return voidDraftRow(req, res, row, lk);
        } catch (err) {
            console.error(`Error voiding ${lk.label.toLowerCase()}:`, err);
            res.status(500).json({ message: 'Internal server error' });
        }
    };
}
exports.voidInvoice = makeVoid(LIFECYCLE_KINDS.invoice);
exports.voidCreditNote = makeVoid(LIFECYCLE_KINDS['credit-note']);
exports.voidDebitNote = makeVoid(LIFECYCLE_KINDS['debit-note']);

async function voidDraftRow(req, res, row, lk) {
    const label = lk.label;
    if (row.status === 'void') return res.status(400).json({ message: `This ${label.toLowerCase()} is already void.` });
    if (row.status === 'pending-approval') {
        return res.status(400).json({ message: `This ${label.toLowerCase()} is awaiting approval - it must be approved or rejected first.` });
    }
    if (row.status !== 'draft') {
        // Debit documents (Invoice / Debit Note) are immutable once posted -
        // the correction is always a Credit Note (user rule 2026-08-13,
        // extended to DN with its slice 2026-09-01).
        return res.status(400).json({ message: lk.mode === 'debit'
            ? `A posted ${label.toLowerCase()} cannot be voided - raise a Credit Note to offset it.`
            : `A posted ${label.toLowerCase()} cannot be voided.` });
    }
    // The void audit (user rule 2026-08-14): the number stays consumed in the
    // gapless series, and who/when/WHY is the auditor's trail for the gap.
    const reason = str(req.body.reason);
    if (!reason) return res.status(400).json({ message: 'A void reason is required (kept for audit).' });
    row.status = 'void';
    row.voidedAt = new Date();
    row.voidedBy = getUserContext(req).userId;
    row.voidReason = reason.slice(0, 255);
    row.updatedBy = row.voidedBy;
    await row.save();
    await require('./taxLedger.service').syncStatus({ docType: row.docKind, docId: row.id, status: 'void' });
    return res.status(200).json({ message: `${label} ${row.docNo} voided.` });
}

// ---------------------------------------------------------------------------
// Official Receipt lifecycle (2026-08-20): Save -> 'draft' ("Open", editable,
// NOT financial) -> Submit -> posted DIRECTLY (user rule: collections carry
// no approval chain - the Refund slice will). Payment method = a Receipt-class
// Transaction Type from the AR catalog (replaces the free-text vocabulary);
// the deposit-collection choice is stored on the draft and resolved at
// posting, after which the remainder FIFO-allocates (receipt behaviour).

async function readReceiptDraftFields(req, companyId, debtor) {
    const dates = parseDates(req.body);
    if (dates.error) return { error: dates.error };
    const amountC = parseAmount(req.body.amount);
    if (!amountC) return { error: 'Amount must be greater than zero.' };

    const ArTransactionType = require('./transactionType.model');
    const txnType = await ArTransactionType.findOne({ where: { companyId, id: str(req.body.transactionTypeId) || null } });
    if (!txnType || !txnType.isActive) return { error: 'Select a payment method.' };
    if (txnType.trxClass !== 'receipt') return { error: 'This transaction type is not a Receipt-class payment method.' };

    const collectDepositId = strOrNull(req.body.collectDepositId);
    if (collectDepositId) {
        const dep = await Deposit.findOne({
            where: { id: collectDepositId, debtorId: debtor.id, status: 'open' },
            attributes: ['id'],
        });
        if (!dep) return { error: 'The deposit is not open on this debtor.' };
    }
    const fxRead = await readFx(companyId, debtor, dates.docDate, req.body);
    if (fxRead.error) return { error: fxRead.error };
    return { dates, txnType, amountC, collectDepositId, fx: fxRead.fx };
}

async function readReceiptDocNo(req, companyId, { ignoreId = null } = {}) {
    const manualNo = strOrNull(req.body.docNo);
    const mode = await numberingGateway.getMode(req, 'ar-receipt');
    if (mode === 'manual' && !manualNo) return { error: 'Receipt number is required (numbering is manual).' };
    if (mode !== 'auto' && manualNo) {
        const clash = await Receipt.findOne({
            where: { companyId, docKind: 'receipt', docNo: manualNo, ...(ignoreId ? { id: { [Op.ne]: ignoreId } } : {}) },
            attributes: ['id'],
        });
        if (clash) return { error: `Receipt number '${manualNo}' is already in use.` };
    }
    return { mode, manualNo };
}

// Create the draft row (both doors: the Receipt screen with debtorId in the
// body, the Debtor Account door via postReceipt below). Gapless rule: the
// number issues INSIDE this transaction.
async function createReceiptDraft(req, res, companyId, debtor) {
    const fields = await readReceiptDraftFields(req, companyId, debtor);
    if (fields.error) return res.status(400).json({ message: fields.error });
    const no = await readReceiptDocNo(req, companyId);
    if (no.error) return res.status(no.error.includes('already in use') ? 409 : 400).json({ message: no.error });

    const placement = await getCallerPlacement(req);
    const stamps = ownershipStamps(req, placement);
    const issue = docNoIssuer(req, 'ar-receipt', no.manualNo);
    const row = await sequelize.transaction(async (t) => Receipt.create({
        companyId,
        debtorId: debtor.id,
        docKind: 'receipt',
        mode: 'credit',
        docNo: await issue(t),
        docDate: fields.dates.docDate,
        trxDate: fields.dates.trxDate,
        transactionTypeId: fields.txnType.id,
        paymentMethod: fields.txnType.transactionType, // display snapshot of the code
        paymentRef: strOrNull(req.body.paymentRef),
        description: strOrNull(req.body.description),
        collectDepositId: fields.collectDepositId,
        amount: posting.money(fields.amountC),
        balanceAmount: posting.money(fields.amountC),
        ...arCurrency.amountFxColumns(fields.fx, fields.amountC),
        sourceModule: 'ar',
        sourceRef: 'manual',
        status: 'draft',
        ...stamps,
    }, { transaction: t }));
    res.status(201).json({ message: `Official Receipt ${row.docNo} saved as Open.`, id: row.id, docNo: row.docNo });
}

// POST /api/ar/receipts - the standalone Receipt screen's door.
exports.createReceipt = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const debtor = await Debtor.findOne({ where: { id: str(req.body.debtorId), companyId } });
        if (!debtor) return res.status(404).json({ message: 'Debtor not found.' });
        return await createReceiptDraft(req, res, companyId, debtor);
    } catch (err) {
        console.error('Error saving receipt draft:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Load a receipt row + its debtor, enforcing the caller's data scope.
async function loadOwnedReceipt(req, res) {
    const { companyId } = getUserContext(req);
    if (!companyId) { res.status(400).json({ message: 'Select a workspace first.' }); return null; }
    const row = await Receipt.findOne({ where: { id: req.params.id, companyId, docKind: 'receipt' } });
    if (!row) { res.status(404).json({ message: 'Receipt not found.' }); return null; }
    const { canModifyRecord } = require('../../platform/serviceContext');
    if (!(await canModifyRecord(req, row))) {
        res.status(403).json({ message: 'This receipt belongs to another user (outside your data scope).' });
        return null;
    }
    const debtor = await Debtor.findOne({ where: { id: row.debtorId, companyId } });
    if (!debtor) { res.status(404).json({ message: 'Debtor not found.' }); return null; }
    return { companyId, row, debtor };
}

// PATCH /api/ar/receipts/:id - edit a draft (drafts only; posted is immutable).
exports.updateReceiptDraft = async (req, res) => {
    try {
        const loaded = await loadOwnedReceipt(req, res);
        if (!loaded) return;
        const { companyId, row, debtor } = loaded;
        if (row.status !== 'draft') {
            return res.status(400).json({ message: `Only an Open (draft) receipt can be edited (this one is ${row.status}).` });
        }
        const fields = await readReceiptDraftFields(req, companyId, debtor);
        if (fields.error) return res.status(400).json({ message: fields.error });
        const no = await readReceiptDocNo(req, companyId, { ignoreId: row.id });
        if (no.error) return res.status(no.error.includes('already in use') ? 409 : 400).json({ message: no.error });

        Object.assign(row, {
            docNo: no.mode === 'auto' ? row.docNo : (no.manualNo || row.docNo),
            docDate: fields.dates.docDate,
            trxDate: fields.dates.trxDate,
            transactionTypeId: fields.txnType.id,
            paymentMethod: fields.txnType.transactionType,
            paymentRef: strOrNull(req.body.paymentRef),
            description: strOrNull(req.body.description),
            collectDepositId: fields.collectDepositId,
            amount: posting.money(fields.amountC),
            // A draft has no allocations - its balance tracks its amount.
            balanceAmount: posting.money(fields.amountC),
            ...arCurrency.amountFxColumns(fields.fx, fields.amountC),
            updatedBy: getUserContext(req).userId,
        });
        await row.save();
        res.status(200).json({ message: 'Receipt draft updated.', id: row.id, docNo: row.docNo });
    } catch (err) {
        console.error('Error updating receipt draft:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/ar/receipts/:id/submit - post the draft directly (no workflow:
// user rule 2026-08-20, collections carry no approval chain).
exports.submitReceipt = async (req, res) => {
    try {
        const loaded = await loadOwnedReceipt(req, res);
        if (!loaded) return;
        const { companyId, row, debtor } = loaded;
        if (row.status !== 'draft') {
            return res.status(400).json({ message: `Only an Open (draft) receipt can be submitted (this one is ${row.status}).` });
        }
        const mode = await numberingGateway.getMode(req, 'ar-receipt');
        if (mode === 'manual' && !row.docNo) {
            return res.status(400).json({ message: 'Receipt number is required before submitting (numbering is manual).' });
        }
        const placement = await getCallerPlacement(req);
        const stamps = ownershipStamps(req, placement);
        try {
            await sequelize.transaction(async (t) => posting.postDraftReceipt({
                companyId, debtor, row,
                issueDocNo: docNoIssuer(req, 'ar-receipt', row.docNo),
                stamps, t,
            }));
        } catch (e) {
            if (e && e.httpStatus) return res.status(e.httpStatus).json({ message: e.message });
            throw e;
        }
        res.status(200).json({ message: `Official Receipt ${row.docNo} posted.`, id: row.id, docNo: row.docNo, status: row.status });
    } catch (err) {
        console.error('Error submitting receipt:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/ar/receipts - cross-debtor Official Receipt listing, shaped like
// the ledger listings so the one transaction screen renders it (grossAmount =
// amount, balanceAmount = unallocated credit).
exports.listReceipts = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const where = { companyId, docKind: 'receipt' };
        const month = str(req.query.month);
        if (/^\d{4}-\d{2}$/.test(month)) {
            const [y, m] = month.split('-').map(Number);
            const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
            where.docDate = { [Op.gte]: `${month}-01`, [Op.lte]: `${month}-${String(last).padStart(2, '0')}` };
        }
        const status = str(req.query.status);
        if (status === 'posted') where.status = 'open';
        else if (['draft', 'open', 'void'].includes(status)) where.status = status;
        const q = str(req.query.q);
        if (q) {
            where[Op.or] = [
                { docNo: { [Op.iLike]: `%${q}%` } },
                { description: { [Op.iLike]: `%${q}%` } },
                { paymentRef: { [Op.iLike]: `%${q}%` } },
            ];
        }
        const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

        const { rows, count } = await Receipt.findAndCountAll({
            where,
            order: [['docDate', 'DESC'], ['createdAt', 'DESC']],
            limit: LIST_LIMIT,
            offset,
        });
        const debtorIds = [...new Set(rows.map((r) => r.debtorId))];
        const debtors = debtorIds.length
            ? await Debtor.findAll({ where: { id: { [Op.in]: debtorIds }, companyId } })
            : [];
        const displayByDebtor = await debtorDisplayMap(companyId, debtors);
        const { annotateCanModify, getCompanyBaseCurrency } = require('../../platform/serviceContext');
        const canModify = await annotateCanModify(req, rows);

        res.status(200).json({
            total: count,
            limit: LIST_LIMIT,
            offset,
            // Rows in another currency get a chip client-side (step 5).
            baseCurrencyCode: await getCompanyBaseCurrency(companyId),
            documents: rows.map((r, i) => ({
                id: r.id, docKind: r.docKind, mode: r.mode, docNo: r.docNo,
                docDate: r.docDate, trxDate: r.trxDate, dueDate: null,
                description: r.description, sourceModule: r.sourceModule || 'ar',
                netAmount: r.amount, taxAmount: '0.00', grossAmount: r.amount,
                balanceAmount: r.balanceAmount, status: r.status,
                voidReason: r.voidReason,
                ...fxDto(r), baseGrossAmount: r.baseAmount,
                // Draft edit prefill.
                transactionTypeId: r.transactionTypeId,
                paymentMethod: r.paymentMethod, paymentRef: r.paymentRef,
                collectDepositId: r.collectDepositId,
                canModify: canModify[i],
                debtor: displayByDebtor.get(r.debtorId) || { id: r.debtorId, debtorType: null, no: null, name: null },
            })),
        });
    } catch (err) {
        console.error('Error listing receipts:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---------------------------------------------------------------------------
// Refund lifecycle (refund slice 2026-08-31): Save -> 'draft' ("Open",
// editable, NOT financial) -> Submit -> the ar-refund approval chain when one
// is active (refunds move money OUT), else posted directly. Three modes
// (user requirements 2026-08-31):
//   'deposit' - pay back a deposit's held balance (bank/cash out);
//   'credit'  - pay back excess payment: unallocated receipt credit, oldest
//               first (bank/cash out);
//   'offset'  - apply a deposit's held balance to OUTSTANDING: the refund is
//               allocated to the deposit and a Credit Note posts in the same
//               transaction to allocate open items - no money movement, so no
//               payment method (Cash Book is untouched).

const REFUND_MODES = ['deposit', 'credit', 'offset'];

async function readRefundDraftFields(req, companyId, debtor) {
    const dates = parseDates(req.body);
    if (dates.error) return { error: dates.error };
    const amountC = parseAmount(req.body.amount);
    if (!amountC) return { error: 'Amount must be greater than zero.' };

    const refundMode = str(req.body.refundMode);
    if (!REFUND_MODES.includes(refundMode)) return { error: 'Pick what is being refunded.' };

    // Bank-facing modes carry a Refund-class payment method (the Cash Book
    // hook); the offset mode moves no money and refuses one.
    let txnType = null;
    if (refundMode === 'offset') {
        if (strOrNull(req.body.transactionTypeId)) {
            return { error: 'A deposit-to-outstanding refund moves no money - it carries no payment method.' };
        }
    } else {
        const ArTransactionType = require('./transactionType.model');
        txnType = await ArTransactionType.findOne({ where: { companyId, id: str(req.body.transactionTypeId) || null } });
        if (!txnType || !txnType.isActive) return { error: 'Select a payment method.' };
        if (txnType.trxClass !== 'refund') return { error: 'This transaction type is not a Refund-class payment method.' };
    }

    // Funding checks at SAVE are advisory (show-expected-results); posting
    // re-checks under lock and REFUSES if the source no longer covers.
    let depositId = null;
    if (refundMode === 'deposit' || refundMode === 'offset') {
        depositId = strOrNull(req.body.collectDepositId);
        if (!depositId) return { error: 'Select the deposit this refund draws on.' };
        const dep = await Deposit.findOne({ where: { id: depositId, debtorId: debtor.id, status: 'open' } });
        if (!dep) return { error: 'The deposit is not open on this debtor.' };
        if (posting.cents(dep.heldAmount) < amountC) {
            return { error: `The held balance of deposit ${dep.docNo} (${dep.heldAmount}) does not cover this refund.` };
        }
    } else {
        const credits = await Receipt.findAll({
            where: { debtorId: debtor.id, docKind: 'receipt', status: 'open' },
            attributes: ['balanceAmount'],
        });
        const availableC = credits.reduce((s, c) => s + posting.cents(c.balanceAmount), 0);
        if (availableC < amountC) {
            return { error: `Unallocated credit on this account is ${posting.money(availableC)} - not enough to fund this refund.` };
        }
    }
    const fxRead = await readFx(companyId, debtor, dates.docDate, req.body);
    if (fxRead.error) return { error: fxRead.error };
    return { dates, refundMode, txnType, amountC, depositId, fx: fxRead.fx };
}

async function readRefundDocNo(req, companyId, { ignoreId = null } = {}) {
    const manualNo = strOrNull(req.body.docNo);
    const mode = await numberingGateway.getMode(req, 'ar-refund');
    if (mode === 'manual' && !manualNo) return { error: 'Refund number is required (numbering is manual).' };
    if (mode !== 'auto' && manualNo) {
        const clash = await Receipt.findOne({
            where: { companyId, docKind: 'refund', docNo: manualNo, ...(ignoreId ? { id: { [Op.ne]: ignoreId } } : {}) },
            attributes: ['id'],
        });
        if (clash) return { error: `Refund number '${manualNo}' is already in use.` };
    }
    return { mode, manualNo };
}

// POST /api/ar/refunds - save a new refund draft (debtorId in the body).
exports.createRefund = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const debtor = await Debtor.findOne({ where: { id: str(req.body.debtorId), companyId } });
        if (!debtor) return res.status(404).json({ message: 'Debtor not found.' });

        const fields = await readRefundDraftFields(req, companyId, debtor);
        if (fields.error) return res.status(400).json({ message: fields.error });
        const no = await readRefundDocNo(req, companyId);
        if (no.error) return res.status(no.error.includes('already in use') ? 409 : 400).json({ message: no.error });

        const placement = await getCallerPlacement(req);
        const stamps = ownershipStamps(req, placement);
        const issue = docNoIssuer(req, 'ar-refund', no.manualNo);
        const row = await sequelize.transaction(async (t) => Receipt.create({
            companyId,
            debtorId: debtor.id,
            docKind: 'refund',
            mode: 'debit',
            docNo: await issue(t),
            docDate: fields.dates.docDate,
            trxDate: fields.dates.trxDate,
            refundMode: fields.refundMode,
            transactionTypeId: fields.txnType ? fields.txnType.id : null,
            paymentMethod: fields.txnType ? fields.txnType.transactionType : null,
            paymentRef: fields.refundMode === 'offset' ? null : strOrNull(req.body.paymentRef),
            description: strOrNull(req.body.description),
            collectDepositId: fields.depositId,
            amount: posting.money(fields.amountC),
            balanceAmount: posting.money(fields.amountC),
            ...arCurrency.amountFxColumns(fields.fx, fields.amountC),
            sourceModule: 'ar',
            sourceRef: 'manual',
            status: 'draft',
            ...stamps,
        }, { transaction: t }));
        res.status(201).json({ message: `Refund ${row.docNo} saved as Open.`, id: row.id, docNo: row.docNo });
    } catch (err) {
        console.error('Error saving refund draft:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Load a refund row + its debtor, enforcing the caller's data scope.
async function loadOwnedRefund(req, res) {
    const { companyId } = getUserContext(req);
    if (!companyId) { res.status(400).json({ message: 'Select a workspace first.' }); return null; }
    const row = await Receipt.findOne({ where: { id: req.params.id, companyId, docKind: 'refund' } });
    if (!row) { res.status(404).json({ message: 'Refund not found.' }); return null; }
    const { canModifyRecord } = require('../../platform/serviceContext');
    if (!(await canModifyRecord(req, row))) {
        res.status(403).json({ message: 'This refund belongs to another user (outside your data scope).' });
        return null;
    }
    const debtor = await Debtor.findOne({ where: { id: row.debtorId, companyId } });
    if (!debtor) { res.status(404).json({ message: 'Debtor not found.' }); return null; }
    return { companyId, row, debtor };
}

// PATCH /api/ar/refunds/:id - edit a draft (drafts only; posted is immutable).
exports.updateRefundDraft = async (req, res) => {
    try {
        const loaded = await loadOwnedRefund(req, res);
        if (!loaded) return;
        const { companyId, row, debtor } = loaded;
        if (row.status !== 'draft') {
            return res.status(400).json({ message: `Only an Open (draft) refund can be edited (this one is ${row.status}).` });
        }
        const fields = await readRefundDraftFields(req, companyId, debtor);
        if (fields.error) return res.status(400).json({ message: fields.error });
        const no = await readRefundDocNo(req, companyId, { ignoreId: row.id });
        if (no.error) return res.status(no.error.includes('already in use') ? 409 : 400).json({ message: no.error });

        Object.assign(row, {
            docNo: no.mode === 'auto' ? row.docNo : (no.manualNo || row.docNo),
            docDate: fields.dates.docDate,
            trxDate: fields.dates.trxDate,
            refundMode: fields.refundMode,
            transactionTypeId: fields.txnType ? fields.txnType.id : null,
            paymentMethod: fields.txnType ? fields.txnType.transactionType : null,
            paymentRef: fields.refundMode === 'offset' ? null : strOrNull(req.body.paymentRef),
            description: strOrNull(req.body.description),
            collectDepositId: fields.depositId,
            amount: posting.money(fields.amountC),
            // A draft has no allocations - its balance tracks its amount.
            balanceAmount: posting.money(fields.amountC),
            ...arCurrency.amountFxColumns(fields.fx, fields.amountC),
            updatedBy: getUserContext(req).userId,
        });
        await row.save();
        res.status(200).json({ message: 'Refund draft updated.', id: row.id, docNo: row.docNo });
    } catch (err) {
        console.error('Error updating refund draft:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/ar/refunds/:id/submit - through the ar-refund approval chain when
// one is active (refunds move money out), else posted directly.
exports.submitRefund = async (req, res) => {
    try {
        const loaded = await loadOwnedRefund(req, res);
        if (!loaded) return;
        const { companyId, row, debtor } = loaded;
        if (row.status !== 'draft') {
            return res.status(400).json({ message: `Only an Open (draft) refund can be submitted (this one is ${row.status}).` });
        }
        const mode = await numberingGateway.getMode(req, 'ar-refund');
        if (mode === 'manual' && !row.docNo) {
            return res.status(400).json({ message: 'Refund number is required before submitting (numbering is manual).' });
        }

        const placement = await getCallerPlacement(req);
        const stamps = ownershipStamps(req, placement);
        const display = await debtorDisplayMap(companyId, [debtor]);
        const who = display.get(debtor.id) || {};
        const workflowGateway = require('../../platform/workflowGateway');

        let outcome;
        try {
            await sequelize.transaction(async (t) => {
                const wf = await workflowGateway.startWorkflow(req, 'ar-refund', {
                    entityId: row.id,
                    entityLabel: `Refund ${row.docNo || 'draft'} — ${who.name || who.no || 'debtor'} (${posting.money(posting.cents(row.amount))})`,
                    context: {
                        amount: Number(row.amount),
                        refundMode: row.refundMode,
                        debtorType: debtor.debtorType,
                        debtorNo: who.no || null,
                    },
                    transaction: t,
                });
                if (wf) {
                    row.status = 'pending-approval';
                    row.workflowInstanceId = wf.instanceId;
                    row.updatedBy = stamps.updatedBy;
                    await row.save({ transaction: t });
                    outcome = { pending: true };
                    return;
                }
                await posting.postDraftRefund({
                    companyId, debtor, row,
                    issueDocNo: docNoIssuer(req, 'ar-refund', row.docNo),
                    issueCnDocNo: docNoIssuer(req, 'ar-credit-note', null),
                    stamps, t,
                });
                outcome = { pending: false };
            });
        } catch (e) {
            if (e && e.httpStatus) return res.status(e.httpStatus).json({ message: e.message });
            throw e;
        }
        res.status(200).json(outcome.pending
            ? { message: 'Refund submitted for approval.', id: row.id, status: row.status }
            : { message: `Refund ${row.docNo} posted.`, id: row.id, docNo: row.docNo, status: row.status });
    } catch (err) {
        console.error('Error submitting refund:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/ar/refunds/:id/void - drafts only, reason kept for audit (a
// POSTED refund is never voidable - the money already left).
exports.voidRefundDraft = async (req, res) => {
    try {
        const loaded = await loadOwnedRefund(req, res);
        if (!loaded) return;
        const { row } = loaded;
        if (row.status === 'void') return res.status(400).json({ message: 'This refund is already void.' });
        if (row.status === 'pending-approval') {
            return res.status(400).json({ message: 'This refund is awaiting approval - it must be approved or rejected first.' });
        }
        if (row.status !== 'draft') {
            return res.status(400).json({ message: 'A posted refund cannot be voided - the money already left; bring it back with a new Official Receipt.' });
        }
        const reason = str(req.body.reason);
        if (!reason) return res.status(400).json({ message: 'A void reason is required (kept for audit).' });
        row.status = 'void';
        row.voidedAt = new Date();
        row.voidedBy = getUserContext(req).userId;
        row.voidReason = reason.slice(0, 255);
        row.updatedBy = row.voidedBy;
        await row.save();
        res.status(200).json({ message: `Refund ${row.docNo} voided.` });
    } catch (err) {
        console.error('Error voiding refund:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/ar/refunds - cross-debtor Refund listing, shaped like the ledger
// listings so the one transaction screen renders it.
exports.listRefunds = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const where = { companyId, docKind: 'refund' };
        const month = str(req.query.month);
        if (/^\d{4}-\d{2}$/.test(month)) {
            const [y, m] = month.split('-').map(Number);
            const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
            where.docDate = { [Op.gte]: `${month}-01`, [Op.lte]: `${month}-${String(last).padStart(2, '0')}` };
        }
        const status = str(req.query.status);
        if (status === 'posted') where.status = 'open';
        else if (['draft', 'pending-approval', 'open', 'void'].includes(status)) where.status = status;
        const q = str(req.query.q);
        if (q) {
            where[Op.or] = [
                { docNo: { [Op.iLike]: `%${q}%` } },
                { description: { [Op.iLike]: `%${q}%` } },
                { paymentRef: { [Op.iLike]: `%${q}%` } },
            ];
        }
        const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

        const { rows, count } = await Receipt.findAndCountAll({
            where,
            order: [['docDate', 'DESC'], ['createdAt', 'DESC']],
            limit: LIST_LIMIT,
            offset,
        });
        const debtorIds = [...new Set(rows.map((r) => r.debtorId))];
        const debtors = debtorIds.length
            ? await Debtor.findAll({ where: { id: { [Op.in]: debtorIds }, companyId } })
            : [];
        const displayByDebtor = await debtorDisplayMap(companyId, debtors);
        const { annotateCanModify, getCompanyBaseCurrency } = require('../../platform/serviceContext');
        const canModify = await annotateCanModify(req, rows);

        res.status(200).json({
            total: count,
            limit: LIST_LIMIT,
            offset,
            baseCurrencyCode: await getCompanyBaseCurrency(companyId),
            documents: rows.map((r, i) => ({
                id: r.id, docKind: r.docKind, mode: r.mode, docNo: r.docNo,
                docDate: r.docDate, trxDate: r.trxDate, dueDate: null,
                description: r.description, sourceModule: r.sourceModule || 'ar',
                netAmount: r.amount, taxAmount: '0.00', grossAmount: r.amount,
                balanceAmount: r.balanceAmount, status: r.status,
                voidReason: r.voidReason,
                ...fxDto(r), baseGrossAmount: r.baseAmount,
                // Draft edit prefill.
                refundMode: r.refundMode,
                transactionTypeId: r.transactionTypeId,
                paymentMethod: r.paymentMethod, paymentRef: r.paymentRef,
                collectDepositId: r.collectDepositId,
                canModify: canModify[i],
                debtor: displayByDebtor.get(r.debtorId) || { id: r.debtorId, debtorType: null, no: null, name: null },
            })),
        });
    } catch (err) {
        console.error('Error listing refunds:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---------------------------------------------------------------------------
// Deposit lifecycle (deposit slice 2026-09-01): Save -> 'draft' ("Open",
// editable, NOT financial - not collectable/refundable, excluded from
// statements) -> Submit -> the ar-deposit approval chain when one is active
// (a deposit demand is a billing act, like an invoice), else posted directly.
// A POSTED deposit stays voidable only while nothing is collected (the
// existing guarded flip); collection happens via Official Receipt.

async function readDepositDraftFields(req, companyId, debtor) {
    const dates = parseDates(req.body);
    if (dates.error) return { error: dates.error };
    const amountC = parseAmount(req.body.amount);
    if (!amountC) return { error: 'Amount must be greater than zero.' };
    const fxRead = await readFx(companyId, debtor, dates.docDate, req.body);
    if (fxRead.error) return { error: fxRead.error };
    return { dates, amountC, fx: fxRead.fx };
}

async function readDepositDocNo(req, companyId, { ignoreId = null } = {}) {
    const manualNo = strOrNull(req.body.docNo);
    const mode = await numberingGateway.getMode(req, DEPOSIT_NUMBERING_PURPOSE);
    if (mode === 'manual' && !manualNo) return { error: 'Deposit number is required (numbering is manual).' };
    if (mode !== 'auto' && manualNo) {
        const clash = await Deposit.findOne({
            where: { companyId, docNo: manualNo, ...(ignoreId ? { id: { [Op.ne]: ignoreId } } : {}) },
            attributes: ['id'],
        });
        if (clash) return { error: `Deposit number '${manualNo}' is already in use.` };
    }
    return { mode, manualNo };
}

// Create the draft row (both doors: the Deposit screen with debtorId in the
// body, the Debtor Account door via postDeposit above - unified like the
// receipt doors, so no door can bypass the lifecycle). Gapless rule: the
// number issues INSIDE this transaction.
async function createDepositDraft(req, res, companyId, debtor) {
    const fields = await readDepositDraftFields(req, companyId, debtor);
    if (fields.error) return res.status(400).json({ message: fields.error });
    const no = await readDepositDocNo(req, companyId);
    if (no.error) return res.status(no.error.includes('already in use') ? 409 : 400).json({ message: no.error });

    const placement = await getCallerPlacement(req);
    const stamps = ownershipStamps(req, placement);
    const issue = docNoIssuer(req, DEPOSIT_NUMBERING_PURPOSE, no.manualNo);
    const row = await sequelize.transaction(async (t) => Deposit.create({
        companyId,
        debtorId: debtor.id,
        docNo: await issue(t),
        docDate: fields.dates.docDate,
        trxDate: fields.dates.trxDate,
        description: strOrNull(req.body.description),
        amount: posting.money(fields.amountC),
        balanceAmount: posting.money(fields.amountC),
        heldAmount: 0,
        ...arCurrency.amountFxColumns(fields.fx, fields.amountC),
        status: 'draft',
        ...stamps,
    }, { transaction: t }));
    res.status(201).json({ message: `Deposit ${row.docNo} saved as Open.`, id: row.id, docNo: row.docNo });
}

// POST /api/ar/deposits - the standalone Deposit screen's door.
exports.createDeposit = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const debtor = await Debtor.findOne({ where: { id: str(req.body.debtorId), companyId } });
        if (!debtor) return res.status(404).json({ message: 'Debtor not found.' });
        return await createDepositDraft(req, res, companyId, debtor);
    } catch (err) {
        console.error('Error saving deposit draft:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Load a deposit row + its debtor, enforcing the caller's data scope.
async function loadOwnedDeposit(req, res) {
    const { companyId } = getUserContext(req);
    if (!companyId) { res.status(400).json({ message: 'Select a workspace first.' }); return null; }
    const row = await Deposit.findOne({ where: { id: req.params.id, companyId } });
    if (!row) { res.status(404).json({ message: 'Deposit not found.' }); return null; }
    const { canModifyRecord } = require('../../platform/serviceContext');
    if (!(await canModifyRecord(req, row))) {
        res.status(403).json({ message: 'This deposit belongs to another user (outside your data scope).' });
        return null;
    }
    const debtor = await Debtor.findOne({ where: { id: row.debtorId, companyId } });
    if (!debtor) { res.status(404).json({ message: 'Debtor not found.' }); return null; }
    return { companyId, row, debtor };
}

// PATCH /api/ar/deposits/:id - edit a draft (drafts only; posted is immutable).
exports.updateDepositDraft = async (req, res) => {
    try {
        const loaded = await loadOwnedDeposit(req, res);
        if (!loaded) return;
        const { companyId, row, debtor } = loaded;
        if (row.status !== 'draft') {
            return res.status(400).json({ message: `Only an Open (draft) deposit can be edited (this one is ${row.status}).` });
        }
        const fields = await readDepositDraftFields(req, companyId, debtor);
        if (fields.error) return res.status(400).json({ message: fields.error });
        const no = await readDepositDocNo(req, companyId, { ignoreId: row.id });
        if (no.error) return res.status(no.error.includes('already in use') ? 409 : 400).json({ message: no.error });

        Object.assign(row, {
            docNo: no.mode === 'auto' ? row.docNo : (no.manualNo || row.docNo),
            docDate: fields.dates.docDate,
            trxDate: fields.dates.trxDate,
            description: strOrNull(req.body.description),
            amount: posting.money(fields.amountC),
            // A draft has no collections - its balance tracks its amount.
            balanceAmount: posting.money(fields.amountC),
            ...arCurrency.amountFxColumns(fields.fx, fields.amountC),
            updatedBy: getUserContext(req).userId,
        });
        await row.save();
        res.status(200).json({ message: 'Deposit draft updated.', id: row.id, docNo: row.docNo });
    } catch (err) {
        console.error('Error updating deposit draft:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/ar/deposits/:id/submit - through the ar-deposit approval chain
// when one is active, else posted directly (opens the deposit for collection).
exports.submitDeposit = async (req, res) => {
    try {
        const loaded = await loadOwnedDeposit(req, res);
        if (!loaded) return;
        const { companyId, row, debtor } = loaded;
        if (row.status !== 'draft') {
            return res.status(400).json({ message: `Only an Open (draft) deposit can be submitted (this one is ${row.status}).` });
        }
        const mode = await numberingGateway.getMode(req, DEPOSIT_NUMBERING_PURPOSE);
        if (mode === 'manual' && !row.docNo) {
            return res.status(400).json({ message: 'Deposit number is required before submitting (numbering is manual).' });
        }

        const placement = await getCallerPlacement(req);
        const stamps = ownershipStamps(req, placement);
        const display = await debtorDisplayMap(companyId, [debtor]);
        const who = display.get(debtor.id) || {};
        const workflowGateway = require('../../platform/workflowGateway');

        let outcome;
        try {
            await sequelize.transaction(async (t) => {
                const wf = await workflowGateway.startWorkflow(req, 'ar-deposit', {
                    entityId: row.id,
                    entityLabel: `Deposit ${row.docNo || 'draft'} — ${who.name || who.no || 'debtor'} (${posting.money(posting.cents(row.amount))})`,
                    context: {
                        amount: Number(row.amount),
                        debtorType: debtor.debtorType,
                        debtorNo: who.no || null,
                    },
                    transaction: t,
                });
                if (wf) {
                    row.status = 'pending-approval';
                    row.workflowInstanceId = wf.instanceId;
                    row.updatedBy = stamps.updatedBy;
                    await row.save({ transaction: t });
                    outcome = { pending: true };
                    return;
                }
                await posting.postDraftDeposit({
                    companyId, debtor, row,
                    issueDocNo: docNoIssuer(req, DEPOSIT_NUMBERING_PURPOSE, row.docNo),
                    stamps, t,
                });
                outcome = { pending: false };
            });
        } catch (e) {
            if (e && e.httpStatus) return res.status(e.httpStatus).json({ message: e.message });
            throw e;
        }
        res.status(200).json(outcome.pending
            ? { message: 'Deposit submitted for approval.', id: row.id, status: row.status }
            : { message: `Deposit ${row.docNo} opened.`, id: row.id, docNo: row.docNo, status: row.status });
    } catch (err) {
        console.error('Error submitting deposit:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/ar/deposits - cross-debtor Deposit listing, shaped like the ledger
// listings so the one transaction screen renders it. balanceAmount = still to
// collect (the Balance column); heldAmount rides along for the HELD cell.
exports.listDeposits = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const where = { companyId };
        const month = str(req.query.month);
        if (/^\d{4}-\d{2}$/.test(month)) {
            const [y, m] = month.split('-').map(Number);
            const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
            where.docDate = { [Op.gte]: `${month}-01`, [Op.lte]: `${month}-${String(last).padStart(2, '0')}` };
        }
        const status = str(req.query.status);
        // 'closed' = fully collected AND fully drawn down - still "posted" on
        // screen, so the posted filter covers both.
        if (status === 'posted') where.status = { [Op.in]: ['open', 'closed'] };
        else if (['draft', 'pending-approval', 'open', 'closed', 'void'].includes(status)) where.status = status;
        const q = str(req.query.q);
        if (q) {
            where[Op.or] = [
                { docNo: { [Op.iLike]: `%${q}%` } },
                { description: { [Op.iLike]: `%${q}%` } },
            ];
        }
        const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

        const { rows, count } = await Deposit.findAndCountAll({
            where,
            order: [['docDate', 'DESC'], ['createdAt', 'DESC']],
            limit: LIST_LIMIT,
            offset,
        });
        const debtorIds = [...new Set(rows.map((r) => r.debtorId))];
        const debtors = debtorIds.length
            ? await Debtor.findAll({ where: { id: { [Op.in]: debtorIds }, companyId } })
            : [];
        const displayByDebtor = await debtorDisplayMap(companyId, debtors);
        const { annotateCanModify, getCompanyBaseCurrency } = require('../../platform/serviceContext');
        const canModify = await annotateCanModify(req, rows);

        res.status(200).json({
            total: count,
            limit: LIST_LIMIT,
            offset,
            baseCurrencyCode: await getCompanyBaseCurrency(companyId),
            documents: rows.map((r, i) => ({
                id: r.id, docKind: 'deposit', mode: 'debit', docNo: r.docNo,
                docDate: r.docDate, trxDate: r.trxDate, dueDate: null,
                description: r.description, sourceModule: 'ar',
                netAmount: r.amount, taxAmount: '0.00', grossAmount: r.amount,
                balanceAmount: r.balanceAmount, heldAmount: r.heldAmount,
                status: r.status,
                voidReason: r.voidReason,
                ...fxDto(r), baseGrossAmount: r.baseAmount,
                canModify: canModify[i],
                debtor: displayByDebtor.get(r.debtorId) || { id: r.debtorId, debtorType: null, no: null, name: null },
            })),
        });
    } catch (err) {
        console.error('Error listing deposits:', err);
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
        // Lifecycle kinds (invoice 2026-08-13, credit-note 2026-08-20) follow
        // Save->Submit on BOTH doors; DN keeps immediate posting until its slice.
        if (LIFECYCLE_KINDS[kind.key]) return await createDraft(req, res, companyId, debtor, LIFECYCLE_KINDS[kind.key]);
        const dates = parseDates(req.body);
        if (dates.error) return res.status(400).json({ message: dates.error });
        const amountC = parseAmount(req.body.amount);
        if (!amountC) return res.status(400).json({ message: 'Amount must be greater than zero.' });

        // AR's own catalog; DN/CN entry takes its own class's entries (the
        // catalog starts with invoice-class rows after the migration - create
        // Debit Note / Credit Note class types on the AR master first).
        const ArTransactionType = require('./transactionType.model');
        const txnType = await ArTransactionType.findOne({ where: { companyId, id: str(req.body.transactionTypeId) || null } });
        if (!txnType || !txnType.isActive) return res.status(400).json({ message: 'Select a transaction type.' });
        if (txnType.trxClass !== kind.key) {
            return res.status(400).json({ message: `This transaction type is not a ${kind.label}-class item.` });
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
        let taxQuote = null;
        if (txnType.taxSchemeCode) {
            const q = await quoteTax(req, { taxSchemeCode: txnType.taxSchemeCode, amount: amountC / 100, onDate: dates.docDate });
            if (!q) return res.status(400).json({ message: `Tax scheme '${txnType.taxSchemeCode}' could not be resolved for this company.` });
            taxQuote = q;
            amounts = {
                netC: posting.cents(q.net),
                taxC: posting.cents(q.taxTotal),
                grossC: posting.cents(q.gross),
                taxSchemeCode: txnType.taxSchemeCode,
                taxRate: q.lines.reduce((s, l) => s + Number(l.taxRate || 0), 0).toFixed(4),
            };
        }

        // Analysis selections (same rules as the draft doors).
        const analysisRead = await dimensionGateway.readSelections(companyId, req.body, AR_MODULE);
        if (analysisRead.error) return res.status(400).json({ message: analysisRead.error });

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
            const taxLedger = require('./taxLedger.service');
            row = await sequelize.transaction(async (t) => {
                const posted = await posting.postLedgerDoc({
                    companyId, debtor, docKind: kind.key,
                    issueDocNo: docNoIssuer(req, kind.numberingPurpose, manualNo),
                    docDate: dates.docDate, trxDate: dates.trxDate,
                    transactionTypeId: txnType.id,
                    isInterestChargeable: txnType.isInterestChargeable === true,
                    description: strOrNull(req.body.description),
                    // Manual AR documents belong to the account itself; incurredBy
                    // is stamped only by producer modules (user rule 2026-08-20).
                    incurredByMemberId: null,
                    sourceModule: 'ar', sourceRef: 'manual',
                    // No FIFO for manual adjustments (user rule 2026-08-20) -
                    // postLedgerDoc's fifo stays for the deposit-conversion CN.
                    amounts, stamps, targetLedger, fifo: false,
                    exchangeRate: req.body.exchangeRate,
                    analysisColumns: analysisRead.columns,
                    t,
                });
                await taxLedger.replaceTaxLines({ companyId, row: posted, quote: taxQuote, stamps, t });
                return posted;
            });
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

// POST /api/ar/debtors/:id/receipts - the Debtor Account door. Since the
// receipt lifecycle (2026-08-20) BOTH doors create drafts through the shared
// dialog; Submit posts (deposit-collection intent + FIFO resolve then).
exports.postReceipt = async (req, res) => {
    try {
        const { error, companyId, debtor } = await loadDebtor(req);
        if (error) return res.status(error.status).json({ message: error.message });
        return await createReceiptDraft(req, res, companyId, debtor);
    } catch (err) {
        console.error('Error saving receipt draft:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/ar/debtors/:id/deposits - the Debtor Account door. Unified with
// the Deposit screen (deposit lifecycle 2026-09-01): both doors create DRAFTS
// through the shared dialog now; collection still happens via an Official
// Receipt once the deposit is posted.
exports.postDeposit = async (req, res) => {
    try {
        const { error, companyId, debtor } = await loadDebtor(req);
        if (error) return res.status(error.status).json({ message: error.message });
        return await createDepositDraft(req, res, companyId, debtor);
    } catch (err) {
        console.error('Error saving deposit draft:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// (The direct deposit-conversion door was REMOVED 2026-09-02: applying held
// deposit money to outstanding goes through the Refund offset kind - one
// door, with a refund document, an allocation trail and approval routing.
// Historical conversion CNs stay valid: the reversal void in voidLedgerDoc
// still restores their deposit's held balance, and the deposit trail viewer
// still lists them by sourceRef.)

// ---------------------------------------------------------------------------
// Void endpoints. Ledger debit -> reversal row; others -> guarded flips.

exports.voidLedger = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await Ledger.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Document not found.' });
        // Debit documents (Invoice / Debit Note since its slice 2026-09-01):
        // draft-only void (posted = Credit Note territory). CN DRAFTS void
        // the same way; a POSTED CN falls through to the reversal path below
        // (unallocated-only - this is also how a deposit-conversion CN void
        // restores the deposit's held balance).
        if (row.docKind === 'invoice') return await voidDraftRow(req, res, row, LIFECYCLE_KINDS.invoice);
        if (row.docKind === 'debit-note') return await voidDraftRow(req, res, row, LIFECYCLE_KINDS['debit-note']);
        if (row.docKind === 'credit-note' && ['draft', 'pending-approval', 'void'].includes(row.status)) {
            return await voidDraftRow(req, res, row, LIFECYCLE_KINDS['credit-note']);
        }
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

        // Receipt DRAFTS void like ledger drafts (never financial): a REASON
        // is kept for audit - the gapless-series trail (receipt lifecycle
        // 2026-08-20). Posted receipts keep the allocation-free flip below.
        if (row.docKind === 'receipt' && row.status === 'draft') {
            const { canModifyRecord } = require('../../platform/serviceContext');
            if (!(await canModifyRecord(req, row))) {
                return res.status(403).json({ message: 'This receipt belongs to another user (outside your data scope).' });
            }
            const reason = str(req.body.reason);
            if (!reason) return res.status(400).json({ message: 'A void reason is required (kept for audit).' });
            row.status = 'void';
            row.voidedAt = new Date();
            row.voidedBy = getUserContext(req).userId;
            row.voidReason = reason.slice(0, 255);
            row.updatedBy = row.voidedBy;
            await row.save();
            return res.status(200).json({ message: `Official Receipt ${row.docNo} voided.` });
        }
        if (row.status === 'void') return res.status(400).json({ message: 'This receipt is already void.' });

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

        // Deposit DRAFTS void like the other document drafts (never
        // financial): a REASON is kept for audit - the gapless-series trail.
        // Posted deposits keep the collections-free flip below.
        if (row.status === 'pending-approval') {
            return res.status(400).json({ message: 'This deposit is awaiting approval - it must be approved or rejected first.' });
        }
        if (row.status === 'draft') {
            const { canModifyRecord } = require('../../platform/serviceContext');
            if (!(await canModifyRecord(req, row))) {
                return res.status(403).json({ message: 'This deposit belongs to another user (outside your data scope).' });
            }
            const reason = str(req.body.reason);
            if (!reason) return res.status(400).json({ message: 'A void reason is required (kept for audit).' });
            row.status = 'void';
            row.voidedAt = new Date();
            row.voidedBy = getUserContext(req).userId;
            row.voidReason = reason.slice(0, 255);
            row.updatedBy = row.voidedBy;
            await row.save();
            return res.status(200).json({ message: `Deposit ${row.docNo} voided.` });
        }

        const placement = await getCallerPlacement(req);
        const stamps = ownershipStamps(req, placement);
        // Record the audit trail on the posted flip too, when a reason came.
        const postedReason = strOrNull(req.body.reason);
        if (postedReason) {
            row.voidReason = postedReason.slice(0, 255);
            row.voidedAt = new Date();
            row.voidedBy = getUserContext(req).userId;
        }
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
