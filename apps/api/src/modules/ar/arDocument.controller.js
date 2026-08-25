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
const dimensionGateway = require('../../platform/dimensionGateway');

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
        // The debtor's collectable DEPOSITS - the Receipt entry's optional
        // "Collect deposit" choices (billed amount not yet fully paid in).
        const openDeposits = (await Deposit.findAll({
            where: { debtorId: debtor.id, status: 'open' },
            order: [['docDate', 'ASC'], ['createdAt', 'ASC']],
            attributes: ['id', 'docNo', 'amount', 'balanceAmount'],
        })).filter((d) => Number(d.balanceAmount) > 0);
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
            analysis: await dimensionGateway.entryMeta(companyId),
            // The AR-OWNED catalog (2026-08-15) with trxClass, so each entry
            // dialog offers only its own document book's types.
            transactionTypes: types.map((t) => t.toJSON()),
            numberingModes: modes,
            invoiceApproval: await workflowGateway.hasActiveWorkflow(req, 'ar-invoice'),
            creditNoteApproval: await workflowGateway.hasActiveWorkflow(req, 'ar-credit-note'),
            openDebits: openDebits.map((d) => ({
                id: d.id, docKind: d.docKind, docNo: d.docNo,
                grossAmount: d.grossAmount, balanceAmount: d.balanceAmount,
            })),
            openDeposits: openDeposits.map((d) => ({
                id: d.id, docNo: d.docNo, amount: d.amount, balanceAmount: d.balanceAmount,
            })),
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
            const { annotateCanModify } = require('../../platform/serviceContext');
            const canModify = await annotateCanModify(req, rows);

            res.status(200).json({
                total: count,
                limit: LIST_LIMIT,
                offset,
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

// ---------------------------------------------------------------------------
// Invoice lifecycle (defined 2026-08-13): Save -> 'draft' ("Open" on screen,
// editable, voidable, NOT financial) -> Submit -> posted directly, or through
// the ar-invoice approval chain ('pending-approval' until the outcome).
// Posted invoices are immutable: corrected with a Credit Note, never voided.

// The manual document kinds that follow the Save -> Submit draft lifecycle
// (invoice since 2026-08-13; credit-note adopted it 2026-08-20). Each keys its
// own numbering series, workflow purpose and catalog class.
const LIFECYCLE_KINDS = {
    invoice: {
        docKind: 'invoice', mode: 'debit', label: 'Invoice',
        numberingPurpose: 'ar-invoice', workflowPurpose: 'ar-invoice', trxClass: 'invoice',
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
    // live slot assignments; required dimensions enforced on manual entry.
    const analysisRead = await dimensionGateway.readSelections(companyId, req.body);
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

async function voidDraftRow(req, res, row, lk) {
    const label = lk.label;
    if (row.status === 'void') return res.status(400).json({ message: `This ${label.toLowerCase()} is already void.` });
    if (row.status === 'pending-approval') {
        return res.status(400).json({ message: `This ${label.toLowerCase()} is awaiting approval - it must be approved or rejected first.` });
    }
    if (row.status !== 'draft') {
        return res.status(400).json({ message: lk.docKind === 'invoice'
            ? 'A posted invoice cannot be voided - raise a Credit Note to offset it.'
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
        const { annotateCanModify } = require('../../platform/serviceContext');
        const canModify = await annotateCanModify(req, rows);

        res.status(200).json({
            total: count,
            limit: LIST_LIMIT,
            offset,
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
        const analysisRead = await dimensionGateway.readSelections(companyId, req.body);
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
                amountC, depositRow, stamps,
                exchangeRate: req.body.exchangeRate,
                t,
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

        const fxRead = await readFx(companyId, debtor, dates.docDate, req.body);
        if (fxRead.error) return res.status(400).json({ message: fxRead.error });

        const placement = await getCallerPlacement(req);
        const stamps = ownershipStamps(req, placement);
        const issue = docNoIssuer(req, DEPOSIT_NUMBERING_PURPOSE, manualNo);

        const row = await sequelize.transaction(async (t) => Deposit.create({
            companyId, debtorId: debtor.id,
            docNo: await issue(t),
            docDate: dates.docDate, trxDate: dates.trxDate,
            description: strOrNull(req.body.description),
            amount: posting.money(amountC),
            ...arCurrency.amountFxColumns(fxRead.fx, amountC),
            balanceAmount: posting.money(amountC), heldAmount: 0, status: 'open',
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

        const conversionType = await require('./catalogDefaults').depositConversionType(companyId);
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
        // Invoices: draft-only void (posted = Credit Note territory). CN
        // DRAFTS void the same way; a POSTED CN falls through to the
        // reversal path below (unallocated-only - this is also how a
        // deposit-conversion CN void restores the deposit's held balance).
        if (row.docKind === 'invoice') return await voidDraftRow(req, res, row, LIFECYCLE_KINDS.invoice);
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
