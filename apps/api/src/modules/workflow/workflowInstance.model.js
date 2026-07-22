const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { WORKFLOW_SCHEMA } = require('../../platform/schemas');

// WorkflowInstance - one running/finished approval per document. The document
// is referenced by (entityType, entityId) as plain UUIDs - never a cross-service
// FK (golden rule 2). `definitionSnapshot` freezes the definition + ordered
// steps at start (render-at-store principle): editing a definition never
// mutates an approval already in flight.
//
// createdBy IS the submitter and createdAt the submit time - no duplicate
// submittedBy/submittedAt columns.
const WorkflowInstance = sequelize.define('WorkflowInstance', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    accountId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The document's company (workspace whose users approve it).
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Reference back to the definition; the SNAPSHOT below is the truth.
    definitionId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    definitionVersion: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    // Denormalized from the definition for inbox/list queries.
    purpose: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    entityType: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    entityId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Human display ("Membership APP-2026-00012") so inbox/history lists render
    // without cross-service joins. Frozen at submit.
    entityLabel: { type: DataTypes.STRING(255), allowNull: true },
    // 'in-progress' | 'approved' | 'rejected' | 'cancelled' (submitter recall).
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'in-progress',
    },
    // NULL once terminal.
    currentStepNo: { type: DataTypes.INTEGER, allowNull: true },
    // The definition + its ordered steps, frozen at start.
    definitionSnapshot: {
        type: DataTypes.JSONB,
        allowNull: false,
    },
    // Condition inputs captured at submit ({ amount, membershipClass, ... }).
    context: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
    },
    completedAt: { type: DataTypes.DATE, allowNull: true },

    // Ownership stamps (RBAC data scope). createdBy = the submitter.
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: WORKFLOW_SCHEMA,
    tableName: 'WorkflowInstance',
    timestamps: true,
    indexes: [
        { name: 'IDX_WorkflowInstance_Account_Status', fields: ['accountId', 'status'] },
        { name: 'IDX_WorkflowInstance_Company_Status', fields: ['companyId', 'status'] },
        // The DB itself guarantees ONE live approval per document, so a
        // double-submit race dies here instead of creating a twin.
        { name: 'IDX_WorkflowInstance_Entity_Live', fields: ['entityType', 'entityId'], unique: true, where: { status: 'in-progress' } },
    ],
});

module.exports = WorkflowInstance;
