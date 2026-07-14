const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { MEMBERSHIP_SCHEMA } = require('../../platform/schemas');

// Membership Fee master file (header) - per company (club). Defines a fee: its
// code, amount, an optional Tax Scheme (referenced by CODE via the tax seam - no
// cross-service FK), and optional installment terms. When installments are
// allowed, the amount is split into `MembershipFeeScheme` stage rows (the detail).
//
// Product-tier data in the `membership` schema. `companyId` is a plain UUID
// reference into the Control Plane (no FK). Enable/disable via `isActive`.
const MembershipFee = sequelize.define('MembershipFee', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Club-defined short code, unique per company (e.g. 'ENTRANCE', 'ANNUAL').
    membershipFeeCode: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Reference to a Tax Scheme by its code (Tax module owns the catalog). NULL =
    // no tax. Resolved/quoted through platform/taxGateway.js, never a direct join.
    taxSchemeCode: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Fee amount. For an installment fee this is the total the stages must sum to.
    // numeric(21,2) is the platform-wide standard for money columns.
    amount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    allowInstallment: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // Number of installment stages when allowInstallment is on (else NULL).
    noOfInstallment: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    // Billing cadence - one of membershipFee.constants INSTALLMENT_INTERVAL_KEYS
    // (else NULL). Header metadata only; stage rows carry no dates.
    installmentInterval: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
}, {
    schema: MEMBERSHIP_SCHEMA,
    tableName: 'MembershipFee',
    timestamps: true,
    indexes: [
        { name: 'IDX_MembershipFee_Company_Code', fields: ['companyId', 'membershipFeeCode'], unique: true },
    ],
});

module.exports = MembershipFee;
