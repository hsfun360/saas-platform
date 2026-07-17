const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// Transaction Type master file - per company. The billing-item catalog the
// other golf setups pick from (green-fee matrices, buggy/caddy charges,
// no-show penalties). Mirrors membership's TransactionType: carries the
// SINGLE SOURCE of the tax scheme for a billing item - the consuming rows
// do not store their own.
//
// `taxSchemeCode` is a value reference into the Tax service BY CODE (the
// business identity of a scheme - stable across effective-dated rate versions
// and catalog reseeds), resolved through platform/taxGateway.js. `companyId`
// is a Control-Plane reference, no FK.
//
// Model name is 'GolfTransactionType' (membership already registered
// 'TransactionType' - Sequelize model names are a single global registry),
// but the TABLE is golf."TransactionType".
const GolfTransactionType = sequelize.define('GolfTransactionType', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The code (e.g. 'GF18', 'CADDY') - unique per company.
    transactionType: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    // 'green-fee' | 'caddy-fee' | 'buggy-fee' | 'no-show' | 'miscellaneous'
    // - transactionType.constants CHARGE_TYPE_KEYS.
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
    schema: GOLF_SCHEMA,
    tableName: 'TransactionType',
    timestamps: true,
    indexes: [
        { name: 'IDX_GolfTransactionType_Company_Code', fields: ['companyId', 'transactionType'], unique: true },
    ],
});

module.exports = GolfTransactionType;
