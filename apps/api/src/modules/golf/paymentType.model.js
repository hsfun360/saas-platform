const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// Payment Type master file - per company. The settlement-tender catalog the
// golf front desk picks from when a bill is paid (cash drawer keys, card
// types, charge-to-account, vouchers...). Mirrors the golf TransactionType
// master's shape: code unique per company + a fixed-vocabulary class +
// description + icon for the settlement tiles. `companyId` is a Control-Plane
// reference, no FK.
const GolfPaymentType = sequelize.define('GolfPaymentType', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The code (e.g. 'CASH', 'VISA') - unique per company.
    paymentType: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    // One of paymentType.constants PAYMENT_CLASS_KEYS: debtor | cash | member |
    // voucher | staff | online | suspend | creditcard.
    paymentClass: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Public GCS URL of the settlement-tile icon (same upload flow as the
    // transaction-type icon).
    iconUrl: {
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
    tableName: 'PaymentType',
    timestamps: true,
    indexes: [
        { name: 'IDX_GolfPaymentType_Company_Code', fields: ['companyId', 'paymentType'], unique: true },
    ],
});

module.exports = GolfPaymentType;
