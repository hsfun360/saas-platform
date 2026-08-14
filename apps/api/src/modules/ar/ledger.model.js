const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { AR_SCHEMA } = require('../../platform/schemas');

// Ledger - the debit/open-item side of the AR document ledger (design approved
// 2026-08-05). Business documents: Invoice / Debit Note / Credit Note - a CN is
// a LEDGER row (mode 'credit') because it behaves exactly like an invoice with
// the sign flipped: it enters the open-item math and allocates against debits.
//
// Mode rules: invoice = debit (a VOID creates a NEW invoice row with mode
// 'credit' + reversalOfId, auto-allocated 100% to the original - history is
// append-only, rows are never mutated); debit-note = debit; credit-note =
// credit.
//
// Dates: docDate = the actual occurrence date (drives aging + dueDate and
// prints on the document); trxDate = the ACCOUNTING-PERIOD date (defaults to
// docDate; a forgotten last-month document keyed after the GL period closed
// keeps last month's docDate with a current-month trxDate).
//
// Amounts are tax-snapshotted at posting (taxSchemeCode/taxRate frozen; the
// Transaction Type catalog is the single tax source). settledAmount is the
// materialized offset counter: for debit rows the portion settled by credits,
// for credit rows the portion applied out - remaining = gross - settled.
const Ledger = sequelize.define('Ledger', {
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
    // 'invoice' | 'debit-note' | 'credit-note' - each its own numbering series.
    docKind: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // 'debit' | 'credit' - the ledger direction (see mode rules above).
    mode: {
        type: DataTypes.STRING(10),
        allowNull: false,
    },
    // Set on a void-reversal row: the ledger row this one reverses.
    reversalOfId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // NULL while a manual document is still a draft (the gapless number is
    // issued at posting - voided drafts never burn a number); a manual-mode
    // draft may carry its keyed number early (reserved by the unique index -
    // Postgres unique treats NULLs as distinct, so unnumbered drafts coexist).
    docNo: {
        type: DataTypes.STRING(30),
        allowNull: true,
    },
    docDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    trxDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // Debit rows only: docDate + Debtor.terms; null = due immediately.
    dueDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
    },
    // Membership Transaction Type catalog (single tax source) - value reference.
    transactionTypeId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Who consumed it (membership Member id); null = the contract / the
    // other-debtor entity itself. Statements itemize by this; personal credit
    // caps count by it. Resolution happened ONCE at posting, immutable.
    incurredByMemberId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // 'membership' | 'golf' | 'pos' | 'facility' | 'ar' (AR-originated:
    // interest run, manual/adjustment documents, deposit conversion).
    sourceModule: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // Originating document reference - full origin traceability. CNs carry the
    // document they reverse; the deposit-conversion CN carries the Deposit id.
    sourceRef: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    netAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
    },
    // Tax snapshot at posting; null scheme = no tax.
    taxSchemeCode: { type: DataTypes.STRING, allowNull: true },
    taxRate: { type: DataTypes.DECIMAL(7, 4), allowNull: true },
    taxAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    grossAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
    },
    // Snapshot from the Transaction Type at posting: does the interest run
    // consider this item when overdue? (Debit rows only.)
    isInterestChargeable: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    settledAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    // Document lifecycle (manual-entry lifecycle defined 2026-08-13):
    //   'draft'            - saved, editable, NOT financial (no balance effect,
    //                        excluded from statements/aging/interest/allocation);
    //                        displays as "Open" per the user's vocabulary.
    //   'pending-approval' - submitted into an approval chain; locked, still
    //                        not financial.
    //   'open' | 'settled' - POSTED (financial; the engine flips open->settled
    //                        as allocations complete - display shows "Posted"
    //                        + the remaining balance, never a Settled chip).
    //   'void'             - draft voided (audit kept) or posted doc reversed
    //                        (system paths only; posted manual invoices are
    //                        corrected with a Credit Note, never voided).
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'open',
    },
    // Posting audit: when the document became financial and by whom (null on
    // system-posted rows that never were drafts).
    postedAt: { type: DataTypes.DATE, allowNull: true },
    postedBy: { type: DataTypes.UUID, allowNull: true },
    // The approval instance a submit routed through (last one on resubmits).
    workflowInstanceId: { type: DataTypes.UUID, allowNull: true },
    // Ownership stamps. Null createdBy = system-posted (billing/interest run,
    // void reversal's allocation, producer charge).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: AR_SCHEMA,
    tableName: 'Ledger',
    timestamps: true,
    indexes: [
        { name: 'IDX_Ledger_Company_Kind_No', fields: ['companyId', 'docKind', 'docNo'], unique: true },
        // FIFO oldest-open-first + open-item scans.
        { name: 'IDX_Ledger_Debtor_Mode_Status_Date', fields: ['debtorId', 'mode', 'status', 'docDate'] },
        { name: 'IDX_Ledger_Source', fields: ['sourceModule', 'sourceRef'] },
        // Financial-period reporting buckets by trxDate.
        { name: 'IDX_Ledger_Company_TrxDate', fields: ['companyId', 'trxDate'] },
    ],
});

module.exports = Ledger;
