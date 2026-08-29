const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { DIMENSION_SCHEMA } = require('../../platform/schemas');

// DimensionOption - one selectable value of a DimensionCategory ('HR',
// 'Marketing', 'Project Alpha', ...). Consuming documents reference options BY
// ID through their own analysis<dimensionNo>Id columns, so renames are free and
// history never strands; options are disabled, never deleted. An option id is
// unique to one company and one category, which lets consumers' analysis
// indexes skip a companyId prefix.
const DimensionOption = sequelize.define('DimensionOption', {
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
            model: { tableName: 'DimensionCategory', schema: DIMENSION_SCHEMA },
            key: 'id',
        },
        onUpdate: 'CASCADE',
    },
    // The option of the PARENT category this one belongs to - where the 1:many
    // of a dimension hierarchy actually lives (many Departments -> one
    // Division). Required once the category declares a parentCategoryId, and
    // forced null when it does not; the controller validates that the target
    // is an option of the declared parent category and of this company.
    //
    // An option left unlinked under a parented category is UNASSIGNED: kept and
    // shown on the setup screen under its own group, but withheld from entry
    // pickers, because the cascade has no Division to offer it under (user
    // decision 2026-08-27). Reparenting one never rewrites history - documents
    // froze both columns at save.
    parentOptionId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: { tableName: 'DimensionOption', schema: DIMENSION_SCHEMA },
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
    schema: DIMENSION_SCHEMA,
    tableName: 'DimensionOption',
    timestamps: true,
    indexes: [
        { name: 'IDX_DimensionOption_Category_Code', fields: ['categoryId', 'code'], unique: true },
        { name: 'IDX_DimensionOption_Company', fields: ['companyId'] },
        { name: 'IDX_DimensionOption_Parent', fields: ['parentOptionId'] },
    ],
});

module.exports = DimensionOption;
