// src/modules/workflow/purposeRegistry.js
//
// Completion-handler registry: how the Workflow service calls BACK into the
// producing module when an approval finishes, without requiring it (that would
// invert the service dependency). The producing module registers its handlers
// at composition time (src/wiring/workflowHandlers.js); the engine looks them
// up by purpose when an instance completes.
//
// The status FLIP runs in-process inside the completing request's transaction
// (small, must be atomic with the instance update). Anything heavy the handler
// wants to do (invoices, email chains, provisioning) must be enqueued to the
// outbox from within the handler, never executed inline - see the architecture
// note in docs/systems/ and the 2026-07-22 execution-flow agreement.
//
// A purpose with NO registered handler is legal: the instance still completes
// and the document screen still shows the outcome via the history endpoint;
// the producing module just hasn't wired its side yet.

const handlers = new Map();

// handlerSet = { onApproved?, onRejected?, onCancelled? } - each an
// async ({ entityType, entityId, instance, transaction }) => void.
function register(purpose, handlerSet) {
    handlers.set(purpose, handlerSet || {});
}

function get(purpose) {
    return handlers.get(purpose) || null;
}

module.exports = { register, get };
