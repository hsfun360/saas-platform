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
//     terms?, creditLimit?, sendReminders?, chargeInterest? }
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
async function postCharge(req, {
    debtorType, sourceId, docDate, trxDate, transactionTypeId, isInterestChargeable,
    description, incurredByMemberId, sourceModule, sourceRef, amounts, stamps,
    enforceCredit = false,
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

    const issueDocNo = async (t) => {
        const issued = await numberingGateway.issueNumber(req, 'ar-invoice', { transaction: t });
        if (issued && issued.number) return issued.number;
        return `INV-${Date.now().toString(36).toUpperCase()}-${String(sourceRef).slice(0, 4).toUpperCase()}`;
    };

    try {
        const row = await sequelize.transaction(async (t) => posting.postLedgerDoc({
            companyId, debtor, docKind: 'invoice', issueDocNo,
            docDate, trxDate, transactionTypeId,
            isInterestChargeable: isInterestChargeable === true,
            description, incurredByMemberId: incurredByMemberId || null,
            sourceModule, sourceRef,
            amounts, stamps: stamps || {}, enforceCredit, t,
        }));
        return { id: row.id, docNo: row.docNo };
    } catch (e) {
        if (e && e.httpStatus) return { error: e.message };
        throw e;
    }
}

module.exports = { enqueueDebtorProvisioning, authorizeCharge, postCharge };
