const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { WORKFLOW_SCHEMA } = require('../../platform/schemas');

// WorkflowTask - one row per assignee per ACTIVATED step: the approver's inbox
// item and, because rows are never deleted, the approval audit trail rendered on
// the document screen. Assignee resolution fans out at step activation (one row
// per person resolved from the step's rule at that moment).
//
// accountId/companyId are denormalized so the My Approvals inbox query
// ((assigneeUserId, status) index) needs no join.
const WorkflowTask = sequelize.define('WorkflowTask', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    instanceId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    accountId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    stepNo: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    // Snapshot of the step name at activation.
    stepName: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    assigneeUserId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // 'pending' | 'approved' | 'rejected' | 'superseded' | 'cancelled'
    // (workflow.constants TASK_STATUSES).
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
    },
    actedAt: { type: DataTypes.DATE, allowNull: true },
    // Approver's remark; required on reject, optional on approve.
    comment: { type: DataTypes.TEXT, allowNull: true },
    // SLA bookkeeping (step.slaHours): when the reminder falls due, and when the
    // worker actually sent it (set once, so the reminder never repeats).
    dueAt: { type: DataTypes.DATE, allowNull: true },
    remindedAt: { type: DataTypes.DATE, allowNull: true },

    // Ownership stamps. updatedBy records the actor on approve/reject.
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: WORKFLOW_SCHEMA,
    tableName: 'WorkflowTask',
    timestamps: true,
    indexes: [
        // THE My Approvals inbox query.
        { name: 'IDX_WorkflowTask_Assignee_Status', fields: ['assigneeUserId', 'status'] },
        { name: 'IDX_WorkflowTask_Instance_StepNo', fields: ['instanceId', 'stepNo'] },
        // The worker's SLA scan: pending tasks whose reminder is due and unsent.
        { name: 'IDX_WorkflowTask_Sla', fields: ['status', 'dueAt'], where: { remindedAt: null } },
    ],
});

module.exports = WorkflowTask;
