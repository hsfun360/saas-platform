const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { TAX_SCHEMA } = require('../../platform/schemas');
const { IE_FLAG_KEYS, TAX_CLASS_KEYS } = require('./tax.constants');

// Tax Scheme - the SUBSCRIBER-OWNED, authoritative tax definition.
//
// This is the source of truth (the template is only a seed). A subscriber either
// loads platform defaults for a country or defines its own; from then on it owns
// and maintains these rows, because it is legally responsible for its own tax.
//
// Country-partitioned by design: a subscriber may operate companies in more than
// one country (SEA rollout), so the catalog is keyed by (accountId, countryCode)
// and a company consumes the set matching ITS OWN country - never the subscriber's
// "home" country. `accountId` and `countryCode` are plain value references (no
// cross-service FK), per the golden rules.
const TaxScheme = sequelize.define('TaxScheme', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // The subscriber (Account) that owns this scheme. UUID reference, no FK.
    accountId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The country this scheme applies to (Country.code). Value reference, no FK.
    countryCode: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // Short business code, unique per (account, country) (e.g. 'SST-OUT').
    taxSchemeCode: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Price treatment - one of IE_FLAG_KEYS (INCLUSIVE | EXCLUSIVE).
    ieFlag: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { isIn: [IE_FLAG_KEYS] },
    },
    // Posting nature - one of TAX_CLASS_KEYS (INPUT | OUTPUT | CONTRA).
    taxClass: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { isIn: [TAX_CLASS_KEYS] },
    },
    // Provenance only: the TaxSchemeTemplate this was seeded from, if any. A plain
    // value (no FK) - copy-on-write means there is no runtime dependency once
    // adopted. NULL for schemes the subscriber authored itself.
    sourceTemplateId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // Whether this scheme is offered when assigning tax to transactions.
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
}, {
    schema: TAX_SCHEMA,
    tableName: 'TaxScheme',
    timestamps: true,
    indexes: [
        { name: 'IDX_TaxScheme_Account_Country_Code', fields: ['accountId', 'countryCode', 'taxSchemeCode'], unique: true },
    ],
});

module.exports = TaxScheme;
