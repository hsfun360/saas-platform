const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { MEMBERSHIP_SCHEMA } = require('../../platform/schemas');

// Membership Type import - one row per uploaded Excel file (the staging
// "mid-table" header), mirroring MembershipImportBatch. Rows live in
// MembershipTypeImportRow; deleting a batch cascades them. Staging only -
// real MembershipType rows are never touched by a delete.
const MembershipTypeImportBatch = sequelize.define('MembershipTypeImportBatch', {
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
    // Parsed count, for the batch list without loading rows.
    totalTypes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: MEMBERSHIP_SCHEMA,
    tableName: 'MembershipTypeImportBatch',
    timestamps: true,
    indexes: [
        { name: 'IDX_MembershipTypeImportBatch_Company', fields: ['companyId'] },
    ],
});

module.exports = MembershipTypeImportBatch;
