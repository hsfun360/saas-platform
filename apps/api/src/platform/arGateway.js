// src/platform/arGateway.js
//
// PEER-SERVICE SEAM: producer systems (Membership / Golf / POS / Facility) ->
// Account Receivable. Every product posts charges into AR; none of them may
// require() the ar module directly (golden rule #4). They call through this
// seam. Writes/fan-out travel as OUTBOX EVENTS (transactional with the
// producer's business change); when AR splits out, the outbox routing changes
// to a broker topic and only THIS file plus the consumer wiring move.
//
// Slice 1 exposes debtor provisioning. The charge-posting/authorization seam
// (authorizeCharge, postCharge) lands with the ledger slice.

const { v4: uuidv4 } = require('uuid');
const OutboxMessage = require('./outboxMessage.model');
const { pingOutboxWorker } = require('./outboxWorkerPing');

// Enqueue a 'DebtorProvisionRequested' event as part of the producer's own
// `transaction` (event-carried state - AR opens the ledger account from the
// payload alone, never reading producer tables):
//   { companyId, debtorType: 'membership'|'member'|'other', sourceId,
//     sourceNo?, requestedBy?, terms?, creditLimit?, sendReminders?,
//     chargeInterest? }
// `sourceNo` labels the party in notifications; `requestedBy` (userId) makes
// the worker bell that user when the account opens or terminally fails -
// interactive saves set it, bulk paths (import/backfill) leave it off.
// Idempotent end-to-end: replays converge on the Debtor unique index, and an
// existing Debtor is never overwritten (AR owns the terms after first
// provisioning). Fire-and-forget by design - activation must not fail because
// AR is busy; the outbox retries until the account exists.
async function enqueueDebtorProvisioning(payload, transaction) {
    await OutboxMessage.create(
        {
            id: uuidv4(),
            type: 'DebtorProvisionRequested',
            payload,
        },
        { transaction },
    );
    // Wake the drain-mode worker (after commit) so the ledger account exists
    // seconds after activation instead of waiting for the 5-minute scheduler
    // sweep. No-op without OUTBOX_WORKER_URL; the sweep is the guarantee.
    pingOutboxWorker(transaction);
}

// --- AR-owned Transaction Type catalog (moved from Membership 2026-08-15) --
// Producer modules and their screens read the catalog through HERE - a module
// only ever sees entries opened to it (`usableInModules`), and the posting
// path re-enforces the same rule. `trxClass` narrows to one document book.
// WHEN SPLIT: GET {internalServiceUrl('ar')}/internal/transaction-types
async function listTransactionTypes(companyId, { module = null, trxClass = null, activeOnly = true } = {}) {
    const { Op } = require('sequelize');
    const TransactionType = require('../modules/ar/transactionType.model');
    const where = { companyId };
    if (activeOnly) where.isActive = true;
    if (trxClass) where.trxClass = trxClass;
    if (module) where.usableInModules = { [Op.contains]: [module] };
    const rows = await TransactionType.findAll({
        where,
        order: [['transactionType', 'ASC']],
        attributes: ['id', 'transactionType', 'trxClass', 'description', 'taxSchemeCode', 'isInterestChargeable', 'usableInModules', 'isEInvoice', 'eInvoiceClassificationCode', 'isActive'],
    });
    return rows.map((r) => r.toJSON());
}

async function getTransactionType(companyId, id, { module = null } = {}) {
    const TransactionType = require('../modules/ar/transactionType.model');
    const row = await TransactionType.findOne({ where: { companyId, id } });
    if (!row) return null;
    if (module && !(Array.isArray(row.usableInModules) && row.usableInModules.includes(module))) return null;
    return row.toJSON();
}

// Is Membership billing through AR for this company? (AR Specification's
// membershipIntegration flag - fee/standing-charge runs check it before
// generating, and postCharge enforces it for membership-sourced documents.)
async function isMembershipIntegrationEnabled(companyId) {
    const Setting = require('../modules/ar/setting.model');
    const row = await Setting.findOne({ where: { companyId }, attributes: ['membershipIntegration'] });
    return !!(row && row.membershipIntegration === true);
}

// ADVISORY credit precheck for producer charges (golf/POS/facility frontend
// consumption): member standing + credit headroom in one call. Advisory ONLY -
// the posting transaction re-checks under lock (race-proof), so a stale yes
// here can still be rejected at posting.
// WHEN SPLIT: POST {internalServiceUrl('ar')}/internal/authorize
async function authorizeCharge(params) {
    const { authorizeCharge: authorize } = require('../modules/ar/arPosting.service');
    return authorize(params);
}

// PRODUCER INVOICE POSTING (fee runs today; golf/POS frontend charges later).
// The producer sends a FULLY RESOLVED charge - amounts already tax-quoted,
// incurredBy already resolved - and AR posts it as one Invoice through its
// engine (balances, personal caps, numbering from the ar-invoice series).
// Returns { id, docNo } or { error } (no ledger account, closed debtor, ...) -
// producers record the error on their own staging row, they never throw.
// `enforceCredit` stays false for billing runs (billing reality is never
// blocked by the limit); frontend consumption will pass true.
// WHEN SPLIT: POST {internalServiceUrl('ar')}/internal/charges
// `taxQuote` is the producer's full tax quote (per-component lines) - frozen
// into ar.TaxLedger alongside the posted document when provided.
async function postCharge(req, {
    debtorType, sourceId, docDate, trxDate, transactionTypeId, isInterestChargeable,
    description, incurredByMemberId, sourceModule, sourceRef, amounts, stamps,
    enforceCredit = false, taxQuote = null,
}) {
    const { getUserContext } = require('./serviceContext');
    const { companyId } = getUserContext(req);
    if (!companyId) return { error: 'No active workspace.' };

    const { sequelize } = require('./db');
    const Debtor = require('../modules/ar/debtor.model');
    const posting = require('../modules/ar/arPosting.service');
    const numberingGateway = require('./numberingGateway');

    const debtor = await Debtor.findOne({ where: { companyId, debtorType, sourceId } });
    if (!debtor) return { error: 'No ledger account exists for this debtor (run debtor provisioning first).' };
    if (debtor.status !== 'active') return { error: `Debtor account is ${debtor.status}.` };

    // Multicurrency (step 3): producer charges are priced in the company BASE
    // currency (fee schemes, frontend tariffs); an account in another
    // currency cannot take them - the document must be in the account's
    // currency, never silently relabelled.
    const { getCompanyBaseCurrency } = require('./serviceContext');
    const base = await getCompanyBaseCurrency(companyId);
    if (base && debtor.currencyCode && debtor.currencyCode !== base) {
        return { error: `This ledger account is in ${debtor.currencyCode}; producer charges post in ${base} only - key it as an AR document on the account.` };
    }

    // Catalog enforcement (2026-08-15): the type must be opened to the
    // posting module, and membership-sourced documents additionally require
    // the AR Specification's Membership-integration switch. Enforced HERE at
    // the seam - picker filtering alone is never the gate.
    const PRODUCER_MODULES = ['membership', 'golf', 'facility', 'pos'];
    if (PRODUCER_MODULES.includes(sourceModule)) {
        const type = await getTransactionType(companyId, transactionTypeId, { module: sourceModule });
        if (!type) return { error: `The transaction type is not usable by the ${sourceModule} module.` };
        if (!type.isActive) return { error: `Transaction type '${type.transactionType}' is inactive.` };
        if (sourceModule === 'membership' && !(await isMembershipIntegrationEnabled(companyId))) {
            return { error: 'Membership integration is switched off in AR Specification - membership documents cannot post to AR.' };
        }
    }

    const issueDocNo = async (t) => {
        const issued = await numberingGateway.issueNumber(req, 'ar-invoice', { transaction: t });
        if (issued && issued.number) return issued.number;
        return `INV-${Date.now().toString(36).toUpperCase()}-${String(sourceRef).slice(0, 4).toUpperCase()}`;
    };

    try {
        const row = await sequelize.transaction(async (t) => {
            const posted = await posting.postLedgerDoc({
                companyId, debtor, docKind: 'invoice', issueDocNo,
                docDate, trxDate, transactionTypeId,
                isInterestChargeable: isInterestChargeable === true,
                description, incurredByMemberId: incurredByMemberId || null,
                sourceModule, sourceRef,
                amounts, stamps: stamps || {}, enforceCredit, t,
            });
            await require('../modules/ar/taxLedger.service').replaceTaxLines({
                companyId, row: posted, quote: taxQuote, stamps: stamps || {}, t,
            });
            return posted;
        });
        return { id: row.id, docNo: row.docNo };
    } catch (e) {
        if (e && e.httpStatus) return { error: e.message };
        throw e;
    }
}

module.exports = {
    enqueueDebtorProvisioning,
    authorizeCharge,
    postCharge,
    listTransactionTypes,
    getTransactionType,
    isMembershipIntegrationEnabled,
};
