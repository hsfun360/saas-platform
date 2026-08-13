const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

const Company = sequelize.define('Company', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    accountId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // 👇 Added to capture the legal registration you mentioned!
    registrationNumber: {
        type: DataTypes.STRING,
        allowNull: true,
    },

    // --- Company profile / billing details (used when generating invoices in the
    // Core system). All nullable so sequelize.sync({ alter: true }) adds them to
    // existing rows; editable over time by a Tenant Admin. ---
    taxRegistrationNumber: { type: DataTypes.STRING, allowNull: true },

    // --- LHDN e-Invoice issuer (supplier) identity (Malaysia MyInvois). All
    // nullable: only Malaysian companies onboarding to e-Invoice fill these.
    // The generic taxRegistrationNumber above predates this block and stays;
    // the e-Invoice layer reads the explicit SST/TTX fields. ---
    // Tax Identification Number (e.g. 'C1234567890').
    tin: { type: DataTypes.STRING(20), allowNull: true },
    // MSIC 2008 business activity code - references EInvoiceMsicCode.code by
    // value (no cross-table FK, per the golden rules).
    msicCode: { type: DataTypes.STRING(20), allowNull: true },
    // Free-text business activity description LHDN wants beside the MSIC code;
    // defaults to the picked MSIC description in the UI but stays editable.
    businessActivityDescription: { type: DataTypes.STRING(300), allowNull: true },
    // SST registration number; submitted as 'NA' when empty.
    sstRegistrationNumber: { type: DataTypes.STRING(35), allowNull: true },
    // Tourism tax registration number (accommodation operators only).
    ttxRegistrationNumber: { type: DataTypes.STRING(35), allowNull: true },

    email: { type: DataTypes.STRING, allowNull: true },
    phone: { type: DataTypes.STRING, allowNull: true },
    website: { type: DataTypes.STRING, allowNull: true },
    addressLine1: { type: DataTypes.STRING, allowNull: true },
    addressLine2: { type: DataTypes.STRING, allowNull: true },
    city: { type: DataTypes.STRING, allowNull: true },
    state: { type: DataTypes.STRING, allowNull: true },
    postalCode: { type: DataTypes.STRING, allowNull: true },
    // Free-text address country (display only, kept for existing invoices/profile).
    country: { type: DataTypes.STRING, allowNull: true },
    // Canonical ISO 3166-1 alpha-2 (lowercase, e.g. 'my'), referencing Country.alpha2
    // by value (no cross-service FK). This is the authoritative country the company
    // operates in - it drives which subscriber tax schemes the company consumes.
    // Nullable: legacy rows have only free-text `country` until a Tenant Admin sets it.
    countryCode: { type: DataTypes.STRING(2), allowNull: true },
    // Public URL of the company logo (Google Cloud Storage), for reports/documents
    // and (optionally) the branded email header.
    logo: { type: DataTypes.STRING, allowNull: true },

    timezone: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Asia/Kuala_Lumpur',
    },
    // The company's default currency (ISO 4217 alpha-3, e.g. 'MYR'), chosen from
    // its subscriber account's opted-in currency set. null = not set.
    defaultCurrencyCode: {
        type: DataTypes.STRING(3),
        allowNull: true,
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    }
}, {
    tableName: 'Company',
    timestamps: true,
});

module.exports = Company;