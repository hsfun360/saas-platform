const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { AR_SCHEMA } = require('../../platform/schemas');

// Receipt - the money-movement side of the AR ledger (design approved
// 2026-08-05). Business documents: Official Receipt (mode 'credit', money in)
// and Refund (mode 'debit', money out). No tax columns - tax lives on ledger
// documents; a receipt just moves money.
//
// balanceAmount is the materialized REMAINING counter (renamed from
// allocatedAmount, user decision 2026-08-24): initialized at `amount` and
// reduced by every allocation until 0. For a receipt it is the UNALLOCATED
// credit (which reduces the pool outstanding immediately); for a refund the
// UNFUNDED portion - a refund must reach 0 within its posting transaction
// (always fully funded by receipt credit or a deposit).
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
    docType: {
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
    // The deposit this document interacts with, captured at entry and
    // resolved at POSTING. Receipts (lifecycle 2026-08-20): the deposit the
    // collection should pay in (closed in between -> FIFO instead). Refunds
    // (refund slice 2026-08-31): the deposit whose HELD balance funds the
    // refund ('deposit' and 'offset' modes; posting refuses if it no longer
    // covers the amount - money out never reroutes silently).
    collectDepositId: { type: DataTypes.UUID, allowNull: true },
    // Refund rows only (refund slice 2026-08-31) - what is being refunded:
    //   'deposit' - a deposit's held balance paid back (bank/cash out);
    //   'credit'  - excess payment: unallocated receipt credit paid back
    //               (bank/cash out, funded FIFO oldest-first at posting);
    //   'offset'  - a deposit's held balance applied to OUTSTANDING: the
    //               refund consumes the deposit and a Credit Note posts in
    //               the same transaction to allocate open items - NO money
    //               movement, so no payment method.
    // NULL on receipt rows and legacy refunds (which behaved as
    // deposit/credit by their allocation).
    refundMode: { type: DataTypes.STRING(10), allowNull: true },
    // The approval-chain instance a submitted refund draft is waiting on
    // (refunds are money OUT, so they route through the ar-refund workflow
    // when a chain is active; receipts never do - user rule 2026-08-20).
    workflowInstanceId: { type: DataTypes.UUID, allowNull: true },
    description: { type: DataTypes.STRING, allowNull: true },
    amount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
    },
    // Remaining balance: = amount at creation, minus every allocation, to 0.
    balanceAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
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
    // Receipts: 'draft' | 'open' | 'void' (lifecycle 2026-08-20): 'draft' =
    // saved manual receipt, editable, NOT financial (no balance effect, no
    // allocation, excluded from statements/refund funding); Submit posts it
    // to 'open' DIRECTLY - receipts carry no approval chain (user rule:
    // collections need no workflow). Refunds (slice 2026-08-31) additionally
    // pass 'pending-approval' between Submit and the ar-refund chain's
    // outcome (approved -> posted, rejected/recalled -> back to 'draft').
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
        { name: 'IDX_Receipt_Company_Kind_No', fields: ['companyId', 'docType', 'docNo'], unique: true },
        { name: 'IDX_Receipt_Debtor_Kind_Status', fields: ['debtorId', 'docType', 'status'] },
        { name: 'IDX_Receipt_Company_TrxDate', fields: ['companyId', 'trxDate'] },
    ],
});

module.exports = Receipt;
