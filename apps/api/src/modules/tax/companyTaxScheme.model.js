const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { TAX_SCHEMA } = require('../../platform/schemas');

// Company adoption of a subscriber TaxScheme - the per-company override layer.
//
// OPT-OUT model: a company consumes every active scheme for its country by default,
// so a row here exists ONLY to override that - either to DISABLE a scheme for this
// one company (isEnabled = false), or to hang per-component GL overrides off it
// (CompanyTaxAccount). Absence of a row = enabled with the subscriber defaults.
//
// `companyId` is a plain UUID reference into the Control Plane (no cross-service FK);
// `taxSchemeId` is an intra-service FK (same tax schema).
const CompanyTaxScheme = sequelize.define('CompanyTaxScheme', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // The company (active workspace) this override applies to. UUID reference, no FK.
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The subscriber scheme being adopted/overridden. Intra-service FK.
    taxSchemeId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: { tableName: 'TaxScheme', schema: TAX_SCHEMA },
            key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    },
    // Whether this company uses the scheme. Default true (a row is usually created to
    // set this false, or to carry GL overrides while staying enabled).
    isEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
}, {
    schema: TAX_SCHEMA,
    tableName: 'CompanyTaxScheme',
    timestamps: true,
    indexes: [
        { name: 'IDX_CompanyTaxScheme_Company_Scheme', fields: ['companyId', 'taxSchemeId'], unique: true },
    ],
});

module.exports = CompanyTaxScheme;
