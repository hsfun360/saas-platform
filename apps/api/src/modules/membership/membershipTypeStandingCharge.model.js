const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { MEMBERSHIP_SCHEMA } = require('../../platform/schemas');

// Membership Type - Standing Charges (detail). The standard periodic fees applied
// to members of this type while they carry a given Membership Status. A status
// can carry MULTIPLE charges (user rule 2026-07-16 - the old one-row-per-status
// unique constraint and the auto-seeded grid are gone); rows are added
// explicitly like joining fees.
//
// Owned by the same service as MembershipType, so a real parent-child FK with
// cascade is used (intra-service). `membershipStatusId` references the company's
// own Membership Status master (#1) - same-service, but kept a plain UUID like the
// type's own default refs so a status can be disabled without a hard constraint.
// `transactionType` references the company's Transaction Type master by code
// (charge type standing-charges); TAX and the billing-line description come from
// that master (the row's own taxSchemeCode, transactionDescription and
// chargesControl columns were dropped 2026-07-16); `currencyCode` is a value
// reference to the platform Currency table.
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
    // the status master). A status may appear on several rows.
    membershipStatusId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Summary of the standing charge (the billing line text comes from the
    // Transaction Type master's description; this is charge-level notes).
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // The billing item - Transaction Type master code. Its description and tax
    // come from the master (transactionDescription + chargesControl columns
    // dropped 2026-07-16 per user - redundant / drove nothing yet).
    transactionType: {
        type: DataTypes.STRING,
        allowNull: false,
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
        // Non-unique lookup index (was unique one-per-status until 2026-07-16;
        // the old unique index is dropped by migration before deploy).
        { name: 'IDX_MembershipTypeStandingCharge_Type_Status', fields: ['membershipTypeId', 'membershipStatusId'] },
    ],
});

module.exports = MembershipTypeStandingCharge;
