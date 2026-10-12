// src/wiring/outboxHandlers.js
//
// COMPOSITION-TIME registry of outbox message handlers that belong to a
// PRODUCT service rather than to the Notification worker itself. The worker
// (src/modules/notification/notification.worker.js) dispatches `msg.type` to
// the handler registered under that key, so the notification module never
// require()s another product module (golden rule #4). Wiring is the
// composition root, so it may require the AR service directly - exactly like
// workflowHandlers.js. When AR splits out, these message types route to the
// AR service's own consumer and this file shrinks.
//
// A handler receives (payload, { transaction }); `transaction` is the worker's
// claim transaction (the message row is marked COMPLETED in it). A throw marks
// the message for retry (FAILED after 5 attempts) - exactly the contract the
// inline branches had.

// Human-readable party label for AR debtor-provisioning notifications, built
// from the event payload alone (event-carried state - no membership reads).
// Shared with the worker's terminal-failure bell.
function debtorLabel(payload) {
    const kind = payload.debtorType === 'member' ? 'nominee' : 'membership';
    return payload.sourceNo ? `${kind} ${payload.sourceNo}` : `a ${kind}`;
}

module.exports = {
    // AR ledger-account provisioning (event-carried state from the producer
    // via platform/arGateway.js). Idempotent find-or-create, so retries and
    // replays are safe.
    DebtorProvisionRequested: async (payload) => {
        const { provisionDebtor } = require('../modules/ar/debtorProvisioning.service');
        const { debtor, created } = await provisionDebtor(payload);
        console.log(`[OUTBOX WORKER] Debtor provisioned (${payload.debtorType}/${payload.sourceId}) -> ${debtor.id}${created ? '' : ' (existing)'}`);
        // Bell the saver when the account actually OPENED (replays /
        // re-activations found an existing row and stay silent).
        // Best-effort: a notification hiccup must not fail the event.
        if (created && payload.requestedBy) {
            try {
                const { notifyUser } = require('../platform/notificationGateway');
                await notifyUser({
                    userId: payload.requestedBy,
                    companyId: payload.companyId,
                    type: 'ar.debtor-provisioned',
                    title: 'AR Account Successfully Replicated',
                    body: `The AR debtor account for ${debtorLabel(payload)} is ready to use.`,
                    linkRoute: `/ar/debtors/${debtor.id}`,
                });
            } catch (nerr) {
                console.warn('[OUTBOX WORKER] Debtor-provisioned notification failed:', nerr.message);
            }
        }
    },

    // Credit-limit ownership split (2026-09-27): Membership owns
    // member-account limits and pushes edits into the AR pool.
    // No ledger account yet = silent no-op (provisioning seeds
    // the value later); replays are idempotent.
    DebtorCreditLimitSyncRequested: async (payload) => {
        const { syncCreditLimit } = require('../modules/ar/debtorProvisioning.service');
        const result = await syncCreditLimit(payload);
        console.log(`[OUTBOX WORKER] Credit limit sync (${payload.debtorType}/${payload.sourceId}) -> ${result.synced ? result.creditLimit : `skipped (${result.reason})`}`);
    },

    debtorLabel,
};
