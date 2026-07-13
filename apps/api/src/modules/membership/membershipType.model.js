const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { MEMBERSHIP_SCHEMA } = require('../../platform/schemas');

// Membership Type master file (main / Category Details) - per company (club).
// The foundational rules, default rights and defaults of a membership category.
// Two child tables hang off it (built in later phases): additional fees and
// standing charges.
//
// Cross-references are stored as plain UUIDs (resolved/validated in the app, no
// DB FK), so a status/fee/type the default points at can be disabled without a
// hard constraint. `companyId` is a Control-Plane reference, no FK.
const MembershipType = sequelize.define('MembershipType', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Main code for the membership type, unique per company (e.g. 'ORD', 'CORP').
    category: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // 'personal' | 'corporate' - one of membershipType.constants MEMBERSHIP_CLASS_KEYS.
    membershipClass: {
        type: DataTypes.STRING,
        allowNull: false,
    },

    // --- Default rights ---
    golfingAllow: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    dependentGolfingAllow: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    votingRight: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    transferRight: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

    // Categories this type may convert into - array of other MembershipType ids
    // (value references, no FK). Empty = not convertible.
    conversionTargetIds: {
        type: DataTypes.ARRAY(DataTypes.UUID),
        allowNull: false,
        defaultValue: [],
    },

    // --- Personal-only ---
    childAgeFrom: { type: DataTypes.INTEGER, allowNull: true },
    childAgeTo: { type: DataTypes.INTEGER, allowNull: true },
    playTimes: { type: DataTypes.INTEGER, allowNull: true },

    // --- Corporate-only ---
    noOfNominee: { type: DataTypes.INTEGER, allowNull: true },
    // A nominee's category classification - another MembershipType id (no FK).
    nomineeCategoryId: { type: DataTypes.UUID, allowNull: true },

    // --- Defaults ---
    // Default state when an account of this type is created - MembershipStatus id.
    defaultMembershipStatusId: { type: DataTypes.UUID, allowNull: true },
    // Standard fee for this type - MembershipFee id.
    defaultMembershipFeeId: { type: DataTypes.UUID, allowNull: true },
    // Default Accounts-Receivable debtor type. Free text until an A/R master exists.
    arDebtorType: { type: DataTypes.STRING, allowNull: true },
    // Maximum financial credit allowance.
    creditLimit: { type: DataTypes.DECIMAL(14, 2), allowNull: true },

    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
}, {
    schema: MEMBERSHIP_SCHEMA,
    tableName: 'MembershipType',
    timestamps: true,
    indexes: [
        { name: 'IDX_MembershipType_Company_Category', fields: ['companyId', 'category'], unique: true },
    ],
});

module.exports = MembershipType;
