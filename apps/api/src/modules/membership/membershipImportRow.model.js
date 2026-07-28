const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { MEMBERSHIP_SCHEMA } = require('../../platform/schemas');
const MembershipImportBatch = require('./membershipImportBatch.model');

// One staged Excel row (either sheet). The parsed columns live in `data`
// (JSONB) so the staging table never chases the real tables' shapes; the
// linking keys are ALSO lifted into real columns for grouping/lookups.
const MembershipImportRow = sequelize.define('MembershipImportRow', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    batchId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: MembershipImportBatch, key: 'id' },
        onDelete: 'CASCADE',
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // 'membership' (sheet 1) | 'member' (sheet 2).
    rowKind: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // The Excel row number, for human-readable issue messages.
    rowNo: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    // Linking keys as read from the file (may be blank for auto numbering).
    membershipNo: { type: DataTypes.STRING(30), allowNull: true },
    memberNo: { type: DataTypes.STRING(30), allowNull: true },
    parentMemberNo: { type: DataTypes.STRING(30), allowNull: true },

    // Every parsed column, keyed by our field names.
    data: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    // Validation findings: [{ level: 'error'|'warning', message }].
    issues: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    // No errors (warnings allowed) - only valid membership groups can migrate.
    isValid: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

    // 'pending' | 'migrated' | 'skipped'.
    migrateStatus: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
    // The real Membership/Member id this row became.
    migratedId: { type: DataTypes.UUID, allowNull: true },
    migratedAt: { type: DataTypes.DATE, allowNull: true },

    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: MEMBERSHIP_SCHEMA,
    tableName: 'MembershipImportRow',
    timestamps: true,
    indexes: [
        { name: 'IDX_MembershipImportRow_Batch', fields: ['batchId'] },
        { name: 'IDX_MembershipImportRow_Batch_No', fields: ['batchId', 'membershipNo'] },
    ],
});

MembershipImportBatch.hasMany(MembershipImportRow, { foreignKey: 'batchId', as: 'rows' });
MembershipImportRow.belongsTo(MembershipImportBatch, { foreignKey: 'batchId', as: 'batch' });

module.exports = MembershipImportRow;
