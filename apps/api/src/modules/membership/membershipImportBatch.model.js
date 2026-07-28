const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { MEMBERSHIP_SCHEMA } = require('../../platform/schemas');

// Membership import - one row per uploaded Excel file (the staging "mid-table"
// header). Rows live in MembershipImportRow; deleting a batch cascades them.
// Staging only - real Membership/Member rows are never touched by a delete.
const MembershipImportBatch = sequelize.define('MembershipImportBatch', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    fileName: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },
    // Parsed counts, for the batch list without loading rows.
    totalMemberships: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    totalMembers: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: MEMBERSHIP_SCHEMA,
    tableName: 'MembershipImportBatch',
    timestamps: true,
    indexes: [
        { name: 'IDX_MembershipImportBatch_Company', fields: ['companyId'] },
    ],
});

module.exports = MembershipImportBatch;
