const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { MEMBERSHIP_SCHEMA } = require('../../platform/schemas');

// Membership Type - Additional Fees (Category Details - Fee, detail). Auxiliary
// fees attached to a membership type: a transaction-type code, an optional tax
// scheme (referenced by CODE via the tax seam), and a currency + amount.
//
// Owned by the same service as MembershipType, so a real parent-child FK with
// cascade is used (intra-service). `transactionType` stays free text until a
// Transaction Type master file exists; `currencyCode` is a value reference to the
// platform Currency table (no FK - reference data lives in the Control Plane).
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
    // Code mapping the transaction (free text until a master file exists).
    transactionType: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Tax plan for this fee - Tax module scheme code (via the seam). NULL = no tax.
    taxSchemeCode: {
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
        type: DataTypes.DECIMAL(14, 2),
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
