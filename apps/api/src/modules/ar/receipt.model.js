const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { AR_SCHEMA } = require('../../platform/schemas');

// Receipt - the money-movement side of the AR ledger (design approved
// 2026-08-05). Business documents: Official Receipt (mode 'credit', money in)
// and Refund (mode 'debit', money out). No tax columns - tax lives on ledger
// documents; a receipt just moves money.
//
// allocatedAmount is materialized: for a receipt, the portion applied out
// (to ledger debits, deposits, or refunds - unallocated = amount - allocated;
// unallocated credit reduces the pool outstanding immediately); for a refund
// it must equal `amount` at posting - a refund is always fully funded by
// allocations from receipt credit or a deposit.
//
// docDate = occurrence date; trxDate = accounting-period date (see Ledger).
const Receipt = sequelize.define('Receipt', {
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
    // 'receipt' | 'refund' - each its own numbering series.
    docKind: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // receipt = 'credit' (money in), refund = 'debit' (money out).
    mode: {
        type: DataTypes.STRING(10),
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
    // Free vocabulary for now (cash/card/bank...); a payment module refines later.
    paymentMethod: { type: DataTypes.STRING, allowNull: true },
    // Cheque no / bank reference / terminal slip.
    paymentRef: { type: DataTypes.STRING, allowNull: true },
    description: { type: DataTypes.STRING, allowNull: true },
    amount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
    },
    allocatedAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    sourceModule: { type: DataTypes.STRING(20), allowNull: true },
    sourceRef: { type: DataTypes.STRING(100), allowNull: true },
    // 'open' | 'void'.
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
    tableName: 'Receipt',
    timestamps: true,
    indexes: [
        { name: 'IDX_Receipt_Company_Kind_No', fields: ['companyId', 'docKind', 'docNo'], unique: true },
        { name: 'IDX_Receipt_Debtor_Kind_Status', fields: ['debtorId', 'docKind', 'status'] },
        { name: 'IDX_Receipt_Company_TrxDate', fields: ['companyId', 'trxDate'] },
    ],
});

module.exports = Receipt;
