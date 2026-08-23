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
    // The Receipt-class Transaction Type this payment was collected under
    // (the AR catalog's payment-method vocabulary, 2026-08-20). Null on
    // legacy/system rows; paymentMethod snapshots the type CODE for display.
    transactionTypeId: { type: DataTypes.UUID, allowNull: true },
    // Payment-method display snapshot (the type code; free text on legacy rows).
    paymentMethod: { type: DataTypes.STRING, allowNull: true },
    // Cheque no / bank reference / terminal slip.
    paymentRef: { type: DataTypes.STRING, allowNull: true },
    // Receipt DRAFTS only (receipt lifecycle 2026-08-20): the deposit this
    // collection should pay in, captured at entry and resolved at POSTING
    // (a deposit closed in between -> the amount FIFO-allocates instead).
    collectDepositId: { type: DataTypes.UUID, allowNull: true },
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
    // Multicurrency (step 3): the account currency, the rate at collection /
    // payout (frozen; this is how "paid MYR for a USD invoice" works - the
    // USD amount is keyed with the day's rate, baseAmount = what hit the
    // till) and the base-currency equivalent. Nullable for the backfill window.
    currencyCode: { type: DataTypes.STRING(3), allowNull: true },
    exchangeRate: { type: DataTypes.DECIMAL(21, 10), allowNull: true },
    baseAmount: { type: DataTypes.DECIMAL(21, 2), allowNull: true },
    sourceModule: { type: DataTypes.STRING(20), allowNull: true },
    sourceRef: { type: DataTypes.STRING(100), allowNull: true },
    // 'draft' | 'open' | 'void' (receipt lifecycle 2026-08-20): 'draft' =
    // saved manual receipt, editable, NOT financial (no balance effect, no
    // allocation, excluded from statements/refund funding); Submit posts it
    // to 'open' DIRECTLY - receipts carry no approval chain (user rule:
    // collections need no workflow; refunds will). Refund rows stay
    // 'open' | 'void' only.
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'open',
    },
    // Posting audit (null on system/legacy rows that never were drafts).
    postedAt: { type: DataTypes.DATE, allowNull: true },
    postedBy: { type: DataTypes.UUID, allowNull: true },
    // Void audit (drafts void with a reason - the gapless-series trail;
    // posted receipts keep the allocation-free flip).
    voidedAt: { type: DataTypes.DATE, allowNull: true },
    voidedBy: { type: DataTypes.UUID, allowNull: true },
    voidReason: { type: DataTypes.STRING, allowNull: true },
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
