// src/modules/workflow/workflowEngine.js
//
// The approval state machine. Every entry point performs ONE small state
// transition inside the caller's transaction (row writes + outbox enqueue) -
// the engine never does slow/fan-out work in-request; emails go through the
// transactional outbox and the worker (2026-07-22 execution-flow agreement).
//
// Concurrency: transitions lock the instance row (SELECT ... FOR UPDATE), and
// the partial unique index IDX_WorkflowInstance_Entity_Live kills double-submit
// races at the constraint.

const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const WorkflowDefinition = require('./workflowDefinition.model');
const WorkflowStep = require('./workflowStep.model');
const WorkflowInstance = require('./workflowInstance.model');
const WorkflowTask = require('./workflowTask.model');
const { PURPOSES } = require('./workflow.constants');
const purposeRegistry = require('./purposeRegistry');
const { resolveApprovers } = require('../../platform/serviceContext');
const { enqueueEmail } = require('../notification/emailOutbox');

const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'http://localhost:4200';

function purposeMeta(key) {
    return PURPOSES.find((p) => p.key === key) || null;
}

// --- Condition evaluation ---------------------------------------------------
// { field, op, value } against the instance context. Missing field or unknown
// op evaluates FALSE (the step is skipped) - a misconfigured condition must
// never stall an approval. Numeric comparison when both sides parse as numbers.
function evalCondition(condition, context) {
    if (!condition || !condition.field) return true; // no condition = always runs
    const actual = (context || {})[condition.field];
    if (actual === undefined || actual === null) return false;
    const expected = condition.value;

    if (condition.op === 'in') {
        const list = Array.isArray(expected) ? expected : [expected];
        return list.some((v) => String(v) === String(actual));
    }

    const aNum = Number(actual);
    const eNum = Number(expected);
    const numeric = !Number.isNaN(aNum) && !Number.isNaN(eNum) && String(actual).trim() !== '' && String(expected).trim() !== '';
    const a = numeric ? aNum : String(actual);
    const e = numeric ? eNum : String(expected);

    switch (condition.op) {
        case 'eq': return a === e;
        case 'ne': return a !== e;
        case 'gt': return a > e;
        case 'gte': return a >= e;
        case 'lt': return a < e;
        case 'lte': return a <= e;
        default: return false;
    }
}

// --- Definition lookup ------------------------------------------------------
// Company-specific definition wins over the account-wide (companyId NULL) one.
async function findActiveDefinition(accountId, companyId, purpose, transaction = null) {
    const specific = await WorkflowDefinition.findOne({
        where: { accountId, companyId, purpose, isActive: true },
        transaction,
    });
    const def = specific || await WorkflowDefinition.findOne({
        where: { accountId, companyId: null, purpose, isActive: true },
        transaction,
    });
    if (!def) return null;
    const steps = await WorkflowStep.findAll({
        where: { definitionId: def.id },
        order: [['stepNo', 'ASC']],
        transaction,
    });
    if (!steps.length) return null; // a chain with no steps enforces nothing
    return { definition: def, steps };
}

function stepSnapshot(s) {
    return {
        stepNo: s.stepNo,
        name: s.name,
        approverType: s.approverType,
        approverRoleId: s.approverRoleId,
        approverDepartmentId: s.approverDepartmentId,
        approverPositionId: s.approverPositionId,
        approverUserId: s.approverUserId,
        approvalMode: s.approvalMode,
        requiredApprovals: s.requiredApprovals,
        condition: s.condition,
        slaHours: s.slaHours,
    };
}

// --- Chain preview (show-expected-results) ---------------------------------
// The chain a submit WOULD take for `context`, with approver names resolved
// now: [{ stepNo, name, approvalMode, requiredApprovals, approvers: [names] }].
// Returns null when no active definition (the document would auto-approve).
async function previewChain(accountId, companyId, purpose, context) {
    const found = await findActiveDefinition(accountId, companyId, purpose);
    if (!found) return null;
    const steps = [];
    for (const s of found.steps) {
        if (!evalCondition(s.condition, context)) continue;
        const approvers = await resolveApprovers(companyId, s);
        steps.push({
            stepNo: s.stepNo,
            name: s.name,
            approvalMode: s.approvalMode,
            requiredApprovals: s.requiredApprovals,
            approvers: approvers.map((a) => a.name),
        });
    }
    return { definitionName: found.definition.name, version: found.definition.version, steps };
}

// --- Step activation --------------------------------------------------------
// Activate the first snapshot step AFTER `fromStepNo` whose condition passes:
// resolve assignees, fan out one task per person, queue their emails. A passing
// step that resolves to NOBODY is skipped with a warning (a stalled invisible
// approval is worse than a skipped step - the history shows what ran). Returns
// true when a step was activated, false when the chain is exhausted.
async function activateNextStep(instance, fromStepNo, transaction) {
    const snapshot = instance.definitionSnapshot;
    const meta = purposeMeta(instance.purpose);

    for (const step of snapshot.steps) {
        if (step.stepNo <= fromStepNo) continue;
        if (!evalCondition(step.condition, instance.context)) continue;

        const approvers = await resolveApprovers(instance.companyId, step);
        if (!approvers.length) {
            console.warn(`[WORKFLOW] Instance ${instance.id} step ${step.stepNo} (${step.name}) resolved no approvers - step skipped.`);
            continue;
        }

        const now = new Date();
        const dueAt = step.slaHours ? new Date(now.getTime() + step.slaHours * 3600 * 1000) : null;
        for (const approver of approvers) {
            await WorkflowTask.create({
                instanceId: instance.id,
                accountId: instance.accountId,
                companyId: instance.companyId,
                stepNo: step.stepNo,
                stepName: step.name,
                assigneeUserId: approver.userId,
                status: 'pending',
                dueAt,
                createdBy: instance.createdBy,
                createdByDepartmentId: instance.createdByDepartmentId,
            }, { transaction });

            // Email is nice-to-have: never let a disabled template / render issue
            // abort the business transaction - the task itself is the inbox.
            try {
                await enqueueEmail({
                    templateKey: 'workflow.task.assigned',
                    accountId: instance.accountId,
                    companyId: instance.companyId,
                    to: approver.email,
                    data: {
                        assigneeName: approver.name,
                        stepName: step.name,
                        documentLabel: instance.entityLabel || instance.entityType,
                        purposeName: meta ? meta.name : instance.purpose,
                        approvalsLink: `${FRONTEND_BASE_URL}/approvals`,
                    },
                }, transaction);
            } catch (err) {
                console.warn(`[WORKFLOW] Could not queue assignment email for ${approver.email}: ${err.message}`);
            }
        }

        instance.currentStepNo = step.stepNo;
        await instance.save({ transaction });
        return true;
    }
    return false;
}

// --- Completion -------------------------------------------------------------
// Flip the instance terminal, notify the submitter, and call the producing
// module's registered handler (status flip in-process; the handler enqueues
// anything heavy to the outbox itself).
async function completeInstance(instance, outcome, transaction) {
    instance.status = outcome; // 'approved' | 'rejected' | 'cancelled'
    instance.currentStepNo = null;
    instance.completedAt = new Date();
    await instance.save({ transaction });

    const handlerSet = purposeRegistry.get(instance.purpose);
    const handler = handlerSet && {
        approved: handlerSet.onApproved,
        rejected: handlerSet.onRejected,
        cancelled: handlerSet.onCancelled,
    }[outcome];
    if (handler) {
        await handler({ entityType: instance.entityType, entityId: instance.entityId, instance, transaction });
    }

    // Submitter outcome email (not for a self-inflicted cancel).
    if (outcome !== 'cancelled' && instance.createdBy) {
        try {
            const User = require('../identity/user.model');
            const submitter = await User.findByPk(instance.createdBy, { attributes: ['full_name', 'email'] });
            if (submitter) {
                const meta = purposeMeta(instance.purpose);
                await enqueueEmail({
                    templateKey: 'workflow.completed',
                    accountId: instance.accountId,
                    companyId: instance.companyId,
                    to: submitter.email,
                    data: {
                        submitterName: submitter.full_name || submitter.email,
                        documentLabel: instance.entityLabel || instance.entityType,
                        purposeName: meta ? meta.name : instance.purpose,
                        outcome,
                        approved: outcome === 'approved',
                    },
                }, transaction);
            }
        } catch (err) {
            console.warn(`[WORKFLOW] Could not queue completion email: ${err.message}`);
        }
    }
}

// --- Start ------------------------------------------------------------------
// Called by the producing module (through workflowGateway) inside ITS business
// transaction when a document is submitted. Returns null when no active
// definition with steps exists - the caller then treats the document as
// auto-approved. Otherwise creates the instance, freezes the snapshot,
// activates the first applicable step and returns the instance.
async function startWorkflow({ accountId, companyId, purpose, entityType, entityId, entityLabel, context, submitterUserId, submitterDepartmentId, transaction }) {
    const found = await findActiveDefinition(accountId, companyId, purpose, transaction);
    if (!found) return null;

    const instance = await WorkflowInstance.create({
        accountId,
        companyId,
        definitionId: found.definition.id,
        definitionVersion: found.definition.version,
        purpose,
        entityType,
        entityId,
        entityLabel: entityLabel || null,
        status: 'in-progress',
        currentStepNo: null,
        definitionSnapshot: {
            definitionId: found.definition.id,
            name: found.definition.name,
            version: found.definition.version,
            steps: found.steps.map(stepSnapshot),
        },
        context: context || {},
        createdBy: submitterUserId || null,
        createdByDepartmentId: submitterDepartmentId || null,
    }, { transaction });

    const activated = await activateNextStep(instance, 0, transaction);
    if (!activated) {
        // Every step skipped by condition/empty resolution: approved on arrival.
        await completeInstance(instance, 'approved', transaction);
    }
    return instance;
}

// --- Approve / reject -------------------------------------------------------
// The assignee acts on their own task. One locked transaction: quorum is
// re-counted under the instance row lock, so two same-moment approvals cannot
// both advance the chain.
async function actOnTask({ taskId, userId, userDepartmentId, decision, comment }) {
    if (!['approved', 'rejected'].includes(decision)) {
        return { error: 'Invalid decision.' };
    }
    if (decision === 'rejected' && !String(comment || '').trim()) {
        return { error: 'A comment is required when rejecting.' };
    }

    return sequelize.transaction(async (transaction) => {
        const task = await WorkflowTask.findByPk(taskId, { transaction });
        if (!task) return { error: 'Task not found.', notFound: true };
        if (task.assigneeUserId !== userId) return { error: 'This task is not assigned to you.', forbidden: true };

        // Lock the instance FIRST - every transition serializes on this row.
        const instance = await WorkflowInstance.findByPk(task.instanceId, {
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!instance || instance.status !== 'in-progress' || task.stepNo !== instance.currentStepNo) {
            return { error: 'This approval has already moved on.', stale: true };
        }
        // Re-read the task under the lock (a sibling may have superseded it).
        await task.reload({ transaction });
        if (task.status !== 'pending') {
            return { error: 'This task has already been decided.', stale: true };
        }

        task.status = decision;
        task.actedAt = new Date();
        task.comment = String(comment || '').trim() || null;
        task.updatedBy = userId;
        await task.save({ transaction });

        if (decision === 'rejected') {
            // One rejection rejects the document. Outstanding tasks are cancelled.
            await WorkflowTask.update(
                { status: 'cancelled', updatedBy: userId },
                { where: { instanceId: instance.id, status: 'pending' }, transaction },
            );
            await completeInstance(instance, 'rejected', transaction);
            return { instance, task };
        }

        // Approved: quorum check for the current step.
        const stepTasks = await WorkflowTask.findAll({
            where: { instanceId: instance.id, stepNo: task.stepNo },
            attributes: ['status'],
            transaction,
        });
        const total = stepTasks.length;
        const approvals = stepTasks.filter((t) => t.status === 'approved').length;
        const step = instance.definitionSnapshot.steps.find((s) => s.stepNo === task.stepNo);
        const needed =
            step.approvalMode === 'all' ? total :
            step.approvalMode === 'count' ? Math.min(Math.max(step.requiredApprovals || 1, 1), total) :
            1; // 'any'

        if (approvals < needed) return { instance, task }; // step still waiting

        // Quorum met: siblings that never acted are superseded, chain advances.
        await WorkflowTask.update(
            { status: 'superseded', updatedBy: userId },
            { where: { instanceId: instance.id, stepNo: task.stepNo, status: 'pending' }, transaction },
        );
        const activated = await activateNextStep(instance, task.stepNo, transaction);
        if (!activated) await completeInstance(instance, 'approved', transaction);
        return { instance, task };
    });
}

// --- Recall / cancel --------------------------------------------------------
// The submitter withdraws an in-flight approval (or the producing module
// cancels it because the document was deleted). Outstanding tasks are
// cancelled; the onCancelled handler (if any) runs.
async function cancelInstance({ instanceId, userId, transaction: outerTx = null }) {
    const run = async (transaction) => {
        const instance = await WorkflowInstance.findByPk(instanceId, {
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!instance) return { error: 'Approval not found.', notFound: true };
        if (instance.status !== 'in-progress') return { error: 'This approval has already completed.', stale: true };
        if (userId && instance.createdBy && instance.createdBy !== userId) {
            return { error: 'Only the submitter can recall this approval.', forbidden: true };
        }

        await WorkflowTask.update(
            { status: 'cancelled', updatedBy: userId || null },
            { where: { instanceId: instance.id, status: 'pending' }, transaction },
        );
        instance.updatedBy = userId || instance.updatedBy;
        await completeInstance(instance, 'cancelled', transaction);
        return { instance };
    };
    return outerTx ? run(outerTx) : sequelize.transaction(run);
}

// Cancel whatever live instance a document has (document deleted / withdrawn by
// the producing module) - no submitter check; the caller owns the document.
async function cancelForEntity(entityType, entityId, transaction) {
    const live = await WorkflowInstance.findOne({
        where: { entityType, entityId, status: 'in-progress' },
        attributes: ['id'],
        transaction,
    });
    if (!live) return null;
    return cancelInstance({ instanceId: live.id, userId: null, transaction });
}

module.exports = {
    evalCondition,
    findActiveDefinition,
    previewChain,
    startWorkflow,
    actOnTask,
    cancelInstance,
    cancelForEntity,
};
