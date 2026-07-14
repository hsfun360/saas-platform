const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { MEMBERSHIP_SCHEMA } = require('../../platform/schemas');

// Membership Type - Standing Charges (detail). The standard periodic fee applied
// to members of this type while they carry a given Membership Status. One row per
// (type, status) - the screen auto-seeds a row for every active status and only
// rows with a billing item configured are persisted.
//
// Owned by the same service as MembershipType, so a real parent-child FK with
// cascade is used (intra-service). `membershipStatusId` references the company's
// own Membership Status master (#1) - same-service, but kept a plain UUID like the
// type's own default refs so a status can be disabled without a hard constraint.
// `chargesControl` and `transactionType` stay free text until their master files
// exist; `taxSchemeCode` / `currencyCode` are value references via the seams.
const MembershipTypeStandingCharge = sequelize.define('MembershipTypeStandingCharge', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // Parent type. Association defined in wiring/associations.js.
    membershipTypeId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The Membership Status this charge applies to (status code + class shown from
    // the status master). Unique per type.
    membershipStatusId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Summary of the standing charge.
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Regulations around fee handling (free text until a master file exists).
    chargesControl: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // The specific billing item: its code and summary.
    transactionType: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    transactionDescription: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Tax plan - Tax module scheme code (via the seam). NULL = no tax.
    taxSchemeCode: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // ISO 4217 alpha-3 code referencing Currency.code (value reference, no FK).
    currencyCode: {
        type: DataTypes.STRING(3),
        allowNull: false,
    },
    amount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    // Billing cadence - one of membershipType.constants STANDING_FREQUENCY_KEYS.
    frequency: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // The month billed (1-12) when frequency is 'fixed-month' (else NULL).
    fixedMonth: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
}, {
    schema: MEMBERSHIP_SCHEMA,
    tableName: 'MembershipTypeStandingCharge',
    timestamps: true,
    indexes: [
        { name: 'IDX_MembershipTypeStandingCharge_Type_Status', fields: ['membershipTypeId', 'membershipStatusId'], unique: true },
    ],
});

module.exports = MembershipTypeStandingCharge;
