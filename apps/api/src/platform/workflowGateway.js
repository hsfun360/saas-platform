// src/platform/workflowGateway.js
//
// INTER-SERVICE SEAM for the Workflow service (approval chains). Producing
// modules (Membership now; Golf / Facility / AR later) call HERE when a
// document is submitted, recalled or deleted - never the workflow models or
// engine directly - same discipline as taxGateway / numberingGateway.
//
// Contract with producers (2026-07-22 execution-flow agreement):
//   - startWorkflow runs inside the producer's business transaction: one small
//     state transition (rows + outbox enqueue), nothing slow.
//   - A null return means NO active chain is configured -> the producer treats
//     the document as auto-approved and proceeds.
//   - Completion flows BACK via the handlers the producer registers in
//     src/wiring/workflowHandlers.js (status flip in-process; heavy side-effects
//     enqueued to the outbox by the handler itself).
//
// In-process today; when the Workflow service is split out, swap these bodies
// for HTTP calls and callers never change.

const { getUserContext, getActiveAccountId, getCallerPlacement } = require('./serviceContext');
const { PURPOSES } = require('../modules/workflow/workflow.constants');

function purposeMeta(purpose) {
    return PURPOSES.find((p) => p.key === purpose) || null;
}

// Is an active chain (with steps) configured for this purpose in the caller's
// workspace? Producers use this to decide whether to show "Submit for approval"
// vs a plain save.
async function hasActiveWorkflow(req, purpose) {
    const accountId = await getActiveAccountId(req);
    const { companyId } = getUserContext(req);
    if (!accountId || !companyId) return false;
    const engine = require('../modules/workflow/workflowEngine');
    return !!(await engine.findActiveDefinition(accountId, companyId, purpose));
}

// The chain a submit WOULD take (approver names resolved now), for the
// producer's pre-submit confirmation (show-expected-results). Null = no chain.
async function previewChain(req, purpose, context = {}) {
    const accountId = await getActiveAccountId(req);
    const { companyId } = getUserContext(req);
    if (!accountId || !companyId) return null;
    const engine = require('../modules/workflow/workflowEngine');
    return engine.previewChain(accountId, companyId, purpose, context);
}

// Start the approval for a submitted document, inside the producer's
// `transaction`. Returns null when no chain is configured (auto-approve), else
// { instanceId, status, currentStepNo }.
// opts = { entityId, entityLabel, context, transaction }.
async function startWorkflow(req, purpose, opts) {
    const meta = purposeMeta(purpose);
    if (!meta) throw new Error(`Unknown workflow purpose: ${purpose}`);
    const accountId = await getActiveAccountId(req);
    const { companyId, userId } = getUserContext(req);
    if (!accountId || !companyId) return null;
    const placement = await getCallerPlacement(req);

    const engine = require('../modules/workflow/workflowEngine');
    const instance = await engine.startWorkflow({
        accountId,
        companyId,
        purpose,
        entityType: meta.entityType,
        entityId: opts.entityId,
        entityLabel: opts.entityLabel,
        context: opts.context,
        submitterUserId: userId,
        submitterDepartmentId: placement.departmentId,
        transaction: opts.transaction,
    });
    if (!instance) return null;
    return { instanceId: instance.id, status: instance.status, currentStepNo: instance.currentStepNo };
}

// Cancel the live approval of a document (deleted / withdrawn by the producer),
// inside the producer's transaction. No-op when none is running.
async function cancelForEntity(entityType, entityId, transaction) {
    const engine = require('../modules/workflow/workflowEngine');
    return engine.cancelForEntity(entityType, entityId, transaction);
}

module.exports = { hasActiveWorkflow, previewChain, startWorkflow, cancelForEntity };
