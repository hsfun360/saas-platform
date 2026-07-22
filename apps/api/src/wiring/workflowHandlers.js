// src/wiring/workflowHandlers.js
//
// COMPOSITION-TIME registration of workflow completion handlers: the one place
// where a producing module's "what happens when the approval finishes" code is
// hooked onto its purpose. Required once from app.js.
//
// Rules for a handler (2026-07-22 execution-flow agreement):
//   - It runs INSIDE the completing request's transaction: flip the document's
//     status and nothing else heavy.
//   - Anything slow or fan-out (invoices, email chains, provisioning) must be
//     enqueued to the outbox from the handler, never executed inline.
//
// A purpose may exist in workflow.constants without a handler here - the chain
// then runs and records its outcome, and the producing module wires its side
// later (that is where 'membership-application' stands today: the Membership
// submit flow is not routed through the gateway yet).

// Example shape (uncomment and implement when Membership submit is wired):
//
// const purposeRegistry = require('../modules/workflow/purposeRegistry');
// purposeRegistry.register('membership-application', {
//     onApproved: async ({ entityId, transaction }) => {
//         // flip the Membership row's status; enqueue side-effects to the outbox
//     },
//     onRejected: async ({ entityId, transaction }) => { ... },
//     onCancelled: async ({ entityId, transaction }) => { ... },
// });

module.exports = {};
