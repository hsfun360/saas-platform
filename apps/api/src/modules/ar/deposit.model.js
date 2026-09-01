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
// the CN carries sourceModule 'ar' + sourceRef = this Deposit, and heldAmount
// drops in the same tx).
// Counters store what REMAINS (user decision 2026-08-24, renamed from
// collectedAmount/utilizedAmount): balanceAmount = still to collect (= amount
// at creation, reduced by collections to 0), heldAmount = the held balance
// (up on collection, down on refund/conversion). Collected so far derives as
// amount - balanceAmount.
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
    // Still to collect: = amount at creation, reduced by receipt->deposit
    // allocations to 0.
    balanceAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
    },
    // Held balance: rises with collections, falls with refunds/conversions.
    heldAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    // Multicurrency (step 3): account currency + the rate when the deposit was
    // billed + base equivalent of `amount`. Nullable for the backfill window.
    currencyCode: { type: DataTypes.STRING(3), allowNull: true },
    exchangeRate: { type: DataTypes.DECIMAL(21, 10), allowNull: true },
    baseAmount: { type: DataTypes.DECIMAL(21, 2), allowNull: true },
    // 'draft' | 'pending-approval' | 'open' | 'closed' | 'void'. Deposit
    // slice (2026-09-01): manual deposits adopt the invoice lifecycle -
    // draft ("Open" on screen, editable, NOT financial: not collectable,
    // not refundable, excluded from statements) -> Submit -> the ar-deposit
    // approval chain when one is active, else posted directly.
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'open',
    },
    // Posting / void audit (deposit lifecycle). A voided draft KEEPS its
    // number - the reason is the auditor's explanation for the sequence gap.
    postedAt: { type: DataTypes.DATE, allowNull: true },
    postedBy: { type: DataTypes.UUID, allowNull: true },
    voidedAt: { type: DataTypes.DATE, allowNull: true },
    voidedBy: { type: DataTypes.UUID, allowNull: true },
    voidReason: { type: DataTypes.STRING, allowNull: true },
    // The in-flight approval instance while status = 'pending-approval'.
    workflowInstanceId: { type: DataTypes.UUID, allowNull: true },
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
