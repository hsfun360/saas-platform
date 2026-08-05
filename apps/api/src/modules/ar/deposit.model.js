const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { AR_SCHEMA } = require('../../platform/schemas');

// Deposit - security deposit held as COLLATERAL for the credit facility
// (design approved 2026-08-05). Deposits never enter the pool outstanding, and
// deliberately have NO link to the credit limit (the limit stays manual).
//
// Lifecycle: collected via Official Receipt allocations (receipt -> deposit);
// paid back via Refund (deposit -> refund allocation); or CONVERTED to a
// Credit Note that knocks off outstanding (a process, not an allocation pair:
// the CN carries sourceModule 'ar' + sourceRef = this Deposit, and
// utilizedAmount bumps in the same tx).
// held balance = collectedAmount - utilizedAmount.
//
// docDate = occurrence date; trxDate = accounting-period date (see Ledger).
const Deposit = sequelize.define('Deposit', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    debtorId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    docNo: {
        type: DataTypes.STRING(30),
        allowNull: false,
    },
    docDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    trxDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    description: { type: DataTypes.STRING, allowNull: true },
    // The required/agreed deposit.
    amount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
    },
    collectedAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    utilizedAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    // 'open' | 'closed' | 'void'.
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'open',
    },
    // Ownership stamps.
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: AR_SCHEMA,
    tableName: 'Deposit',
    timestamps: true,
    indexes: [
        { name: 'IDX_Deposit_Company_No', fields: ['companyId', 'docNo'], unique: true },
        { name: 'IDX_Deposit_Debtor_Status', fields: ['debtorId', 'status'] },
        { name: 'IDX_Deposit_Company_TrxDate', fields: ['companyId', 'trxDate'] },
    ],
});

module.exports = Deposit;
