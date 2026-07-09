const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { TAX_SCHEMA } = require('../../platform/schemas');
const { IE_FLAG_KEYS, TAX_CLASS_KEYS } = require('./tax.constants');

// Tax Scheme TEMPLATE - the platform-seeded starter catalog, one set per country.
//
// This is an onboarding accelerator ONLY, not a live source of truth. It is a
// best-effort, point-in-time snapshot (see `seededAsOf`): a subscriber runs
// "Load defaults for <country>", the rows are COPIED into their own
// subscriber-owned `TaxScheme`/`TaxRate` tables, and from that moment the two
// diverge (copy-on-write). The platform never chases ongoing rate changes - the
// subscriber, who is legally responsible for its own tax, maintains them.
//
// Header row: identifies the scheme (code + name) and its calculation nature
// (inclusive/exclusive, input/output/contra). The rate line(s) live on the
// TaxRateTemplate detail, so a scheme can carry multiple stacked components by
// priority. `countryCode` is a plain value reference to the platform Country
// reference table (no cross-service FK, per the golden rules).
const TaxSchemeTemplate = sequelize.define('TaxSchemeTemplate', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // The country this scheme applies to (Country.code). Value reference, no FK.
    countryCode: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // Short business code for the scheme, unique within a country (e.g. 'SST-OUT').
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
    // Posting nature - one of TAX_CLASS_KEYS (INPUT | OUTPUT | CONTRA). Stored as
    // `taxClass`: `class` is a reserved word in JS and awkward in SQL.
    taxClass: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { isIn: [TAX_CLASS_KEYS] },
    },
    // The date this seed snapshot was known-accurate. A subscriber should verify
    // rates against current law before relying on them.
    seededAsOf: {
        type: DataTypes.DATEONLY,
        allowNull: true,
    },
    // Whether this template is offered when loading defaults.
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
}, {
    // Owned by the Tax service -> its own Postgres schema, so it lifts out with a
    // clean `pg_dump --schema=tax`. See platform/schemas.js.
    schema: TAX_SCHEMA,
    tableName: 'TaxSchemeTemplate',
    timestamps: true,
    indexes: [
        { name: 'IDX_TaxSchemeTemplate_Country_Code', fields: ['countryCode', 'taxSchemeCode'], unique: true },
    ],
});

module.exports = TaxSchemeTemplate;
