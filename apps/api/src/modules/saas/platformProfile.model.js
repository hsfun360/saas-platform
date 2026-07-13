const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// The PLATFORM's own "company of record" - the SaaS provider as the legal entity that
// bills subscribers. A SINGLETON (one row, guarded by `singletonKey`): unlike a
// subscriber Company (many, tenant-owned), there is exactly one issuer.
//
// It serves two jobs:
//   1. Invoice-issuer identity (the "bill-from" header on a Subscription Fee invoice):
//      legal name, tax registration, address, logo.
//   2. Billing config that anchors the platform's OWN tax:
//      - `countryCode` = the platform's home country. The platform-owned tax catalog
//        (TaxScheme where accountId IS NULL) spans many countries because it is also
//        the subscriber starter catalog; this pins which country's schemes apply to
//        the platform's own charges, so a MY invoice can never pick a Thai scheme.
//      - `defaultTaxSchemeCode` = which of that country's platform schemes taxes a
//        platform charge by default (Subscription Fee and other fees; a country can
//        have several: SST-E, SC SST-E, …).
//
// Mirrors the invoice-profile fields already on Company, so the two invoice headers
// (platform-to-subscriber, subscriber-to-member) stay structurally identical.
const PlatformProfile = sequelize.define('PlatformProfile', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // Singleton guard: a fixed value with a unique index (declared in `indexes` below,
    // NOT inline `unique: true` - inline unique + a defaultValue makes sequelize's
    // `sync({ alter })` emit invalid SQL: `SET DEFAULT 'platform' UNIQUE`).
    singletonKey: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'platform',
    },

    // --- Issuer identity (invoice header) ---
    legalName: { type: DataTypes.STRING, allowNull: true },
    tradingName: { type: DataTypes.STRING, allowNull: true },
    registrationNumber: { type: DataTypes.STRING, allowNull: true },
    taxRegistrationNumber: { type: DataTypes.STRING, allowNull: true },
    email: { type: DataTypes.STRING, allowNull: true },
    phone: { type: DataTypes.STRING, allowNull: true },
    website: { type: DataTypes.STRING, allowNull: true },
    addressLine1: { type: DataTypes.STRING, allowNull: true },
    addressLine2: { type: DataTypes.STRING, allowNull: true },
    city: { type: DataTypes.STRING, allowNull: true },
    state: { type: DataTypes.STRING, allowNull: true },
    postalCode: { type: DataTypes.STRING, allowNull: true },
    // Public URL of the platform logo (for the invoice header).
    logo: { type: DataTypes.STRING, allowNull: true },

    // --- Billing config (anchors the platform's own tax) ---
    // Canonical ISO 3166-1 alpha-2 (lowercase, e.g. 'my'), referencing Country.alpha2
    // by value. The SINGLE source of the platform's country - its display name is
    // resolved from the Country reference at render time (no free-text duplicate).
    // Drives which platform-owned tax schemes apply to the platform's charges.
    countryCode: { type: DataTypes.STRING(2), allowNull: true },
    // Default currency the platform bills in (ISO 4217 alpha-3, e.g. 'MYR').
    baseCurrencyCode: { type: DataTypes.STRING(3), allowNull: true },
    // The DEFAULT platform-owned tax scheme code (in `countryCode`) applied to a
    // platform charge (Subscription Fee and any other fee). Plain value - resolved
    // against TaxScheme (accountId NULL) at quote time.
    defaultTaxSchemeCode: { type: DataTypes.STRING, allowNull: true },
}, {
    tableName: 'PlatformProfile',
    timestamps: true,
    indexes: [
        { name: 'UX_PlatformProfile_singleton', unique: true, fields: ['singletonKey'] },
    ],
});

module.exports = PlatformProfile;
