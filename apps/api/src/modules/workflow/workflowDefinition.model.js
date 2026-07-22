const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { WORKFLOW_SCHEMA } = require('../../platform/schemas');

// WorkflowDefinition - a subscriber's approval chain for one document type
// (purpose). SUBSCRIBER-owned: there is deliberately NO platform NULL-account
// row here - approver rules point at the subscriber's own roles/departments/
// users, so a platform default cannot be meaningful.
//
// Scoping: companyId NULL = applies to every company of the account; a
// company-specific row overrides the account-wide one (same idea as SMTP /
// weekend days). ONE definition per purpose per scope - routing variations live
// in step conditions, not in competing definitions.
//
// Rows are edited IN PLACE with `version` bumped on every change: safe because
// running instances freeze a snapshot of the definition at start and never read
// it again (see workflowInstance.model.js).
const WorkflowDefinition = sequelize.define('WorkflowDefinition', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // The owning subscriber (Account). UUID reference, no FK.
    accountId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // NULL = account-wide; set = this company only (overrides the account-wide row).
    companyId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // Which document type routes through this chain (workflow.constants PURPOSES).
    purpose: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    description: { type: DataTypes.TEXT, allowNull: true },
    // Bumped on every edit of the definition or its steps (audit/diagnostics;
    // instances stamp the version they started under).
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    // Inactive = documents of this purpose auto-approve (workflow is opt-in).
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: WORKFLOW_SCHEMA,
    tableName: 'WorkflowDefinition',
    timestamps: true,
    indexes: [
        // Company-specific rows: unique per account+purpose+company.
        { name: 'IDX_WorkflowDefinition_Acct_Purpose_Company', fields: ['accountId', 'purpose', 'companyId'], unique: true },
        // The account-wide (companyId NULL) subset needs its own partial unique -
        // Postgres treats NULLs as distinct in the composite above.
        { name: 'IDX_WorkflowDefinition_Acct_Purpose_Null', fields: ['accountId', 'purpose'], unique: true, where: { companyId: null } },
    ],
});

module.exports = WorkflowDefinition;
