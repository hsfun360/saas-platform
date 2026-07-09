const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { TAX_SCHEMA } = require('../../platform/schemas');

// Per-company GL-account override for one component (taxCode) of an adopted scheme.
//
// The subscriber TaxRate carries a DEFAULT glAccountCode; a company whose chart of
// accounts differs overrides it here, per taxCode (the same grain the default lives
// at). Keyed by taxCode, not by the effective-dated TaxRate row, because the GL
// account is stable across a component's rate history. Absence = use the default.
//
// Child of CompanyTaxScheme (same tax schema) - intra-service FK, cascade with the
// parent adoption row.
const CompanyTaxAccount = sequelize.define('CompanyTaxAccount', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // Parent adoption row.
    companyTaxSchemeId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: { tableName: 'CompanyTaxScheme', schema: TAX_SCHEMA },
            key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    },
    // The component this override targets (matches TaxRate.taxCode).
    taxCode: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // The company's GL account for this component (required - a row only exists to
    // override; clearing the override deletes the row).
    glAccountCode: {
        type: DataTypes.STRING,
        allowNull: false,
    },
}, {
    schema: TAX_SCHEMA,
    tableName: 'CompanyTaxAccount',
    timestamps: true,
    indexes: [
        { name: 'IDX_CompanyTaxAccount_Scheme_Code', fields: ['companyTaxSchemeId', 'taxCode'], unique: true },
    ],
});

module.exports = CompanyTaxAccount;
