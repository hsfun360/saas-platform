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

module.exports = { enqueueDebtorProvisioning };
