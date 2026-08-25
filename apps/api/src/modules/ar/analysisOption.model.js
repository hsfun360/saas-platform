const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { AR_SCHEMA } = require('../../platform/schemas');

// AnalysisOption - one selectable value of an AnalysisCategory ('HR',
// 'Marketing', 'Project Alpha', ...). Ledger documents reference options BY ID
// (analysis<slotNo>Id), so renames are free and history never strands;
// options are disabled, never deleted. An option id is unique to one company
// and one category, which is what lets the Ledger analysis indexes skip a
// companyId prefix.
const AnalysisOption = sequelize.define('ArAnalysisOption', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Parent category. Intra-service FK (same schema), like TaxRate -> TaxScheme.
    categoryId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: { tableName: 'AnalysisCategory', schema: AR_SCHEMA },
            key: 'id',
        },
        onUpdate: 'CASCADE',
    },
    // Short business code keyed/scanned by clerks (e.g. 'FNB', 'PRJ-A').
    code: {
        type: DataTypes.STRING(30),
        allowNull: false,
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: AR_SCHEMA,
    tableName: 'AnalysisOption',
    timestamps: true,
    indexes: [
        { name: 'IDX_ArAnalysisOption_Category_Code', fields: ['categoryId', 'code'], unique: true },
        { name: 'IDX_ArAnalysisOption_Company', fields: ['companyId'] },
    ],
});

module.exports = AnalysisOption;
