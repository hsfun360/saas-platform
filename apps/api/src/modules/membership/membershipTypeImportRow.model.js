const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { MEMBERSHIP_SCHEMA } = require('../../platform/schemas');
const MembershipTypeImportBatch = require('./membershipTypeImportBatch.model');

// One staged Excel row of the Membership Types sheet. The parsed columns live
// in `data` (JSONB) so the staging table never chases the real table's shape;
// the linking key (the category code) is ALSO lifted into a real column for
// grouping/lookups - same design as MembershipImportRow.
const MembershipTypeImportRow = sequelize.define('MembershipTypeImportRow', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    batchId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: MembershipTypeImportBatch, key: 'id' },
        onDelete: 'CASCADE',
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The Excel row number, for human-readable issue messages.
    rowNo: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    // The category code as read from the file (the type's unique key).
    category: { type: DataTypes.STRING(50), allowNull: true },

    // Every parsed column, keyed by our field names.
    data: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    // Validation findings: [{ level: 'error'|'warning', message }].
    issues: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    // No errors (warnings allowed) - only valid rows can migrate.
    isValid: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

    // 'pending' | 'migrated'.
    migrateStatus: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
    // The real MembershipType id this row became.
    migratedId: { type: DataTypes.UUID, allowNull: true },
    migratedAt: { type: DataTypes.DATE, allowNull: true },

    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: MEMBERSHIP_SCHEMA,
    tableName: 'MembershipTypeImportRow',
    timestamps: true,
    indexes: [
        { name: 'IDX_MembershipTypeImportRow_Batch', fields: ['batchId'] },
        { name: 'IDX_MembershipTypeImportRow_Batch_Cat', fields: ['batchId', 'category'] },
    ],
});

MembershipTypeImportBatch.hasMany(MembershipTypeImportRow, { foreignKey: 'batchId', as: 'rows' });
MembershipTypeImportRow.belongsTo(MembershipTypeImportBatch, { foreignKey: 'batchId', as: 'batch' });

module.exports = MembershipTypeImportRow;
