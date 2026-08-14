// src/modules/workflow/workflow.reminders.js
//
// The Workflow service's ONE piece of time-driven work: the SLA scan, run
// periodically by the outbox worker (never in an API request). A pending task
// whose `dueAt` (activation + step slaHours) has passed is handled per the
// step's configuration:
//
//   escalateOnSla = false  ->  exactly one REMINDER (email + bell) to the same
//                              approvers; `remindedAt` set in the same
//                              transaction makes the send-once guarantee
//                              transactional.
//   escalateOnSla = true   ->  ESCALATE (2026-08-14): the step's pending tasks
//                              flip to 'escalated' and the NEXT step in the
//                              chain activates (its approvers get the normal
//                              assignment email + bell). The LAST step falls
//                              back to the reminder - nobody above to escalate
//                              to. Each escalated-to step carries its own
//                              slaHours, so a chain can climb level by level.
//
// Claims rows FOR UPDATE SKIP LOCKED, so multiple worker instances never
// double-remind or double-escalate.

const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const WorkflowInstance = require('./workflowInstance.model');
const WorkflowTask = require('./workflowTask.model');
const { PURPOSES } = require('./workflow.constants');
const { enqueueEmail } = require('../notification/emailOutbox');

const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'http://localhost:4200';

async function scanSlaReminders() {
    const transaction = await sequelize.transaction();
    try {
        const due = await WorkflowTask.findAll({
            where: {
                status: 'pending',
                remindedAt: null,
                dueAt: { [Op.ne]: null, [Op.lte]: new Date() },
            },
            limit: 20,
            transaction,
            lock: true,
            skipLocked: true,
        });
        if (!due.length) {
            await transaction.commit();
            return;
        }

        const User = require('../identity/user.model');
        const purposeName = new Map(PURPOSES.map((p) => [p.key, p.name]));

        // Escalation is a per-STEP decision - group the claimed tasks so one
        // breached step escalates once, not once per approver.
        const groups = new Map(); // `${instanceId}:${stepNo}` -> tasks[]
        for (const task of due) {
            const key = `${task.instanceId}:${task.stepNo}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(task);
        }

        for (const tasks of groups.values()) {
            const first = tasks[0];
            try {
                const instance = await WorkflowInstance.findByPk(first.instanceId, { transaction });
                // Instance moved on: mark reminded so the rows stop matching
                // the scan; there is nobody to nag.
                if (!instance || instance.status !== 'in-progress') {
                    for (const t of tasks) { t.remindedAt = new Date(); await t.save({ transaction }); }
                    continue;
                }

                const step = ((instance.definitionSnapshot || {}).steps || [])
                    .find((s) => s.stepNo === first.stepNo);

                // --- Escalation path -----------------------------------------
                if (step && step.escalateOnSla === true && instance.currentStepNo === first.stepNo) {
                    const engine = require('./workflowEngine');
                    const activated = await engine.activateNextStep(instance, first.stepNo, transaction);
                    if (activated) {
                        // Close EVERY still-pending task of the breached step
                        // (quorum siblings included, claimed or not).
                        await WorkflowTask.update(
                            { status: 'escalated', remindedAt: new Date() },
                            { where: { instanceId: instance.id, stepNo: first.stepNo, status: 'pending' }, transaction },
                        );
                        console.log(`[WORKFLOW SLA] Instance ${instance.id} step ${first.stepNo} (${first.stepName}) escalated to step ${instance.currentStepNo}.`);
                        continue;
                    }
                    // Chain exhausted - fall through to the reminder below.
                }

                // --- Reminder path (email + bell, exactly once) --------------
                for (const task of tasks) {
                    const assignee = await User.findByPk(task.assigneeUserId, { attributes: ['full_name', 'email'], transaction });
                    if (assignee) {
                        await enqueueEmail({
                            templateKey: 'workflow.task.reminder',
                            accountId: task.accountId,
                            companyId: task.companyId,
                            to: assignee.email,
                            data: {
                                assigneeName: assignee.full_name || assignee.email,
                                stepName: task.stepName,
                                documentLabel: instance.entityLabel || instance.entityType,
                                purposeName: purposeName.get(instance.purpose) || instance.purpose,
                                approvalsLink: `${FRONTEND_BASE_URL}/approvals`,
                            },
                        }, transaction);
                        try {
                            const { notifyUser } = require('../../platform/notificationGateway');
                            await notifyUser({
                                userId: task.assigneeUserId,
                                companyId: task.companyId,
                                type: 'workflow-task',
                                title: `Reminder: ${instance.entityLabel || instance.entityType} still needs your approval`,
                                body: `${purposeName.get(instance.purpose) || instance.purpose} — step "${task.stepName}" has passed its deadline.`,
                                linkRoute: '/approvals',
                                transaction,
                            });
                        } catch (err) {
                            console.warn(`[WORKFLOW SLA] Could not create reminder notification for ${task.assigneeUserId}: ${err.message}`);
                        }
                        console.log(`[WORKFLOW SLA] Reminder queued for task ${task.id} (${task.stepName}) -> ${assignee.email}`);
                    }
                    task.remindedAt = new Date();
                    await task.save({ transaction });
                }
            } catch (err) {
                // One bad group must not block the batch; it stays unreminded
                // and is retried on the next scan.
                console.error(`[WORKFLOW SLA] Failed to process task group ${first.instanceId}:${first.stepNo}:`, err.message);
            }
        }
        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        console.error('[WORKFLOW SLA] Scan failed:', error);
    }
}

module.exports = { scanSlaReminders };
