const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { MEMBERSHIP_SCHEMA } = require('../../platform/schemas');

// Membership Type - Joining Fees (detail): one-time charges billed when a new
// member joins under the type (processing / entrance fees, ...).
//
// Owned by the same service as MembershipType, so a real parent-child FK with
// cascade is used (intra-service). `transactionType` references the company's
// Transaction Type master by code (validated in the app; charge type
// membership-fee | absentee-fee); TAX comes from that master - the row carries
// no taxSchemeCode of its own (column dropped 2026-07-16). `currencyCode` is a
// value reference to the platform Currency table (no FK).
const MembershipTypeFee = sequelize.define('MembershipTypeFee', {
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
    // Transaction Type master code (value reference, validated in the app).
    transactionType: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // ISO 4217 alpha-3 code referencing Currency.code (value reference, no FK).
    currencyCode: {
        type: DataTypes.STRING(3),
        allowNull: false,
    },
    // Transaction amount in the given currency.
    amount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
}, {
    schema: MEMBERSHIP_SCHEMA,
    tableName: 'MembershipTypeFee',
    timestamps: true,
    indexes: [
        { name: 'IDX_MembershipTypeFee_Type', fields: ['membershipTypeId'] },
    ],
});

module.exports = MembershipTypeFee;
