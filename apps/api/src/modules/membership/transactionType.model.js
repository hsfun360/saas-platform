const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { MEMBERSHIP_SCHEMA } = require('../../platform/schemas');

// Transaction Type master file - per company. The billing-item catalog the other
// membership setups pick from (Joining fees, Standing charges, and later the
// Phase 3 transfer/absentee charges). Carries the SINGLE SOURCE of the tax
// scheme for a billing item - the consuming rows no longer store their own.
//
// `taxSchemeCode` is a value reference into the Tax service BY CODE (the
// business identity of a scheme - stable across effective-dated rate versions
// and catalog reseeds), resolved through platform/taxGateway.js like every other
// membership tax reference. `companyId` is a Control-Plane reference, no FK.
const TransactionType = sequelize.define('TransactionType', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The code (e.g. 'PROCESS', 'MSUB') - unique per company.
    transactionType: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    // 'membership-fee' | 'standing-charges' | 'membership-transfer' |
    // 'absentee-fee' | 'miscellaneous' - transactionType.constants CHARGE_TYPE_KEYS.
    chargeType: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Tax Scheme by code via the tax seam; null = no tax.
    taxSchemeCode: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: MEMBERSHIP_SCHEMA,
    tableName: 'TransactionType',
    timestamps: true,
    indexes: [
        { name: 'IDX_TransactionType_Company_Code', fields: ['companyId', 'transactionType'], unique: true },
    ],
});

module.exports = TransactionType;
