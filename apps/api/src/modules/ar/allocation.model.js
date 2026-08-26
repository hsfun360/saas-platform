const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { AR_SCHEMA } = require('../../platform/schemas');

// Allocation - the open-item link that moves value from a credit-bearing
// document to a debit-bearing one (design approved 2026-08-05). Valid pairs
// (validated in arPosting.service, single source ALLOCATION_PAIRS):
//   receipt        -> ledger (debit)   payment settles Invoice/DN (FIFO default)
//   ledger (credit)-> ledger (debit)   CN / void reversal offsets (targeted)
//   receipt        -> deposit          deposit collection via Official Receipt
//   deposit        -> refund           deposit refund
//   receipt        -> refund           refunding unallocated overpayment
// There is deliberately NO deposit -> ledger pair: applying a deposit to
// outstanding is the CONVERSION process (deposit -> CN, then the CN allocates).
//
// UNIQUE on the 4-col pair: re-allocating the same pair UPDATES the row (the
// audit log keeps history). Reconciliation asserts the materialized counters
// (balanceAmount on all three document tables / Deposit.heldAmount /
// outstanding / personalUsed) against these rows.
const Allocation = sequelize.define('Allocation', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // 'receipt' | 'ledger' | 'deposit' - where the value comes from.
    creditDocType: {
        type: DataTypes.STRING(10),
        allowNull: false,
    },
    creditDocId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // 'ledger' | 'refund' | 'deposit' - where it goes. 'refund' targets an
    // ar.Receipt row of docKind 'refund'.
    debitDocType: {
        type: DataTypes.STRING(10),
        allowNull: false,
    },
    debitDocId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    amount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
    },
    // --- Multicurrency (step 4, 2026-08-26) ---
    // Realized exchange gain (+) / loss (-) in BASE currency for this pair:
    // amount x (credit doc rate - debit doc rate), integer-cents rounded the
    // same way as the documents' base equivalents. 0.00 for base-currency
    // accounts and same-rate pairs; NULL = the row predates the column
    // (reconciliation stamps it additively). Accumulates with `amount` on
    // upserts - both documents' rates are frozen, so the per-cent delta never
    // changes for a pair, and the sign never flips.
    fxGainLoss: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: true,
    },
    // The Forex-class ar.TransactionType the realized difference is
    // classified under (the AR Specification designations - gain vs loss by
    // sign; explicit configuration, never inferred). NULL when the pair has
    // no fx difference. GL-facing - never a debtor-facing document.
    fxTransactionTypeId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // Ownership stamps. Null createdBy = system allocation (FIFO at receipt
    // posting, void reversal); set = manual (re)allocation.
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: AR_SCHEMA,
    tableName: 'Allocation',
    timestamps: true,
    indexes: [
        {
            name: 'IDX_Allocation_Pair',
            fields: ['creditDocType', 'creditDocId', 'debitDocType', 'debitDocId'],
            unique: true,
        },
        { name: 'IDX_Allocation_Credit', fields: ['creditDocType', 'creditDocId'] },
        { name: 'IDX_Allocation_Debit', fields: ['debitDocType', 'debitDocId'] },
        { name: 'IDX_Allocation_Company', fields: ['companyId'] },
    ],
});

module.exports = Allocation;
