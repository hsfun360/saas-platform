const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { WORKFLOW_SCHEMA } = require('../../platform/schemas');

// WorkflowStep - one ordered step of a WorkflowDefinition (intra-service FK,
// cascade with its definition). Approver targets are explicit UUID columns (not
// a JSONB blob) so they stay queryable and reviewable; role/department/position/
// user ids are cross-schema Control-Plane references, so plain UUIDs, no FK.
//
// Editing steps bumps the parent definition's `version`; running instances are
// untouched (they froze a snapshot at start).
const WorkflowStep = sequelize.define('WorkflowStep', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    definitionId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // 1-based order; the designer's drag-reorder rewrites these.
    stepNo: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    // 'role' | 'department-position' | 'user' (workflow.constants APPROVER_TYPES).
    approverType: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // when approverType = 'role'
    approverRoleId: { type: DataTypes.UUID, allowNull: true },
    // when approverType = 'department-position' (position NULL = anyone in the department)
    approverDepartmentId: { type: DataTypes.UUID, allowNull: true },
    approverPositionId: { type: DataTypes.UUID, allowNull: true },
    // when approverType = 'user'
    approverUserId: { type: DataTypes.UUID, allowNull: true },
    // 'any' (first decision wins) | 'all' | 'count' (requiredApprovals).
    approvalMode: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'any',
    },
    requiredApprovals: { type: DataTypes.INTEGER, allowNull: true },
    // Entry condition { field, op, value } evaluated against the instance
    // context; the step is SKIPPED when it evaluates false. NULL = always runs.
    condition: { type: DataTypes.JSONB, allowNull: true },
    // Reminder email (via the outbox worker) after N hours pending; NULL = none.
    slaHours: { type: DataTypes.INTEGER, allowNull: true },

    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: WORKFLOW_SCHEMA,
    tableName: 'WorkflowStep',
    timestamps: true,
    indexes: [
        { name: 'IDX_WorkflowStep_Definition_StepNo', fields: ['definitionId', 'stepNo'], unique: true },
    ],
});

module.exports = WorkflowStep;
