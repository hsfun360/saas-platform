// src/modules/workflow/workflow.reminders.js
//
// The Workflow service's ONE piece of time-driven work: the SLA reminder scan,
// run periodically by the outbox worker (never in an API request). A pending
// task whose `dueAt` (activation + step slaHours) has passed and whose
// `remindedAt` is unset gets exactly one reminder email; setting `remindedAt`
// in the same transaction as the enqueue makes the send-once guarantee
// transactional. Claims rows FOR UPDATE SKIP LOCKED, so multiple worker
// instances never double-remind.

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

        for (const task of due) {
            try {
                const [instance, assignee] = await Promise.all([
                    WorkflowInstance.findByPk(task.instanceId, { transaction }),
                    User.findByPk(task.assigneeUserId, { attributes: ['full_name', 'email'], transaction }),
                ]);
                // Instance moved on or assignee gone: mark reminded so the row
                // stops matching the scan; there is nobody to nag.
                if (instance && instance.status === 'in-progress' && assignee) {
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
                    console.log(`[WORKFLOW SLA] Reminder queued for task ${task.id} (${task.stepName}) -> ${assignee.email}`);
                }
                task.remindedAt = new Date();
                await task.save({ transaction });
            } catch (err) {
                // One bad task must not block the batch; it stays unreminded and
                // is retried on the next scan.
                console.error(`[WORKFLOW SLA] Failed to remind task ${task.id}:`, err.message);
            }
        }
        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        console.error('[WORKFLOW SLA] Scan failed:', error);
    }
}

module.exports = { scanSlaReminders };
