const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { AR_SCHEMA } = require('../../platform/schemas');

// Statement - the monthly cutoff document (approved 2026-08-05; print-complete
// revision 2026-08-06). THIS is where every snapshot lands: the run resolves
// the debtor's name/address/contact, the issuing company's letterhead, the
// deposit balance and the aging buckets ONCE and freezes them here - printing
// a statement never re-resolves or recomputes, and the thin-Debtor rule (no
// party data on the ledger account) stays intact.
//
// statementMonth is the OVERWRITE key: regenerating a debtor's month deletes
// the existing Statement (+details) and creates a fresh one, enforced by the
// partial unique index (void rows from the pre-overwrite era are exempt).
const Statement = sequelize.define('Statement', {
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
    statementNo: {
        type: DataTypes.STRING(30),
        allowNull: false,
    },
    // The cutoff date.
    statementDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // First day of the Statement Month - the accounting month this statement
    // belongs to (the overwrite key). The docDate range actually used can
    // straddle months (cutoff-day periods like 28 Jul - 27 Aug).
    statementMonth: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    periodStart: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    periodEnd: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // Debtor snapshots: raw ledger type (membership | member | other) and the
    // refined scope category (individual | corporate | nominee | other) - both
    // frozen so listing filters and prints never re-join.
    debtorType: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    debtorCategory: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // Membership / member / other-debtor number snapshot.
    debtorNo: {
        type: DataTypes.STRING(30),
        allowNull: true,
    },
    // Multicurrency (step 5): the ACCOUNT currency every amount on this
    // statement is denominated in - snapshotted at generation, FOREIGN
    // accounts only (NULL = the company base currency), so single-currency
    // companies' statements are unchanged and no backfill is needed.
    currencyCode: {
        type: DataTypes.STRING(3),
        allowNull: true,
    },
    openingBalance: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
    },
    closingBalance: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
    },
    // Party snapshot, frozen at generation.
    billName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // { line1, line2, line3, city, state, postcode, countryCode } - whatever
    // the party master held at generation time.
    billAddress: {
        type: DataTypes.JSONB,
        allowNull: true,
    },
    // Printed when the receiver is a Corporate membership (the contract's
    // contact person); Other Debtors use their own contact field.
    contactPerson: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Issuer letterhead snapshot (the club's own name/reg-no/address at
    // generation).
    companyName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    companyRegistrationNo: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    companyAddress: {
        type: DataTypes.JSONB,
        allowNull: true,
    },
    // Debtor's security-deposit balance (held minus utilized) at generation.
    deposit: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    // Aging of the closing balance at periodEnd, bucketed by the company's
    // ar.Setting day boundaries (aging1..aging6). N filled boundaries produce
    // N+1 buckets: aging1..agingN per boundary, plus the "over last boundary"
    // amount in the column right after the last filled boundary. Unused
    // trailing columns stay 0. agingBoundaries snapshots the boundaries used,
    // so a later Setting change never re-labels a generated statement.
    aging1: { type: DataTypes.DECIMAL(21, 2), allowNull: false, defaultValue: 0 },
    aging2: { type: DataTypes.DECIMAL(21, 2), allowNull: false, defaultValue: 0 },
    aging3: { type: DataTypes.DECIMAL(21, 2), allowNull: false, defaultValue: 0 },
    aging4: { type: DataTypes.DECIMAL(21, 2), allowNull: false, defaultValue: 0 },
    aging5: { type: DataTypes.DECIMAL(21, 2), allowNull: false, defaultValue: 0 },
    aging6: { type: DataTypes.DECIMAL(21, 2), allowNull: false, defaultValue: 0 },
    aging7: { type: DataTypes.DECIMAL(21, 2), allowNull: false, defaultValue: 0 },
    // e.g. [30, 60, 90, 120] - the boundaries in force at generation.
    agingBoundaries: {
        type: DataTypes.JSONB,
        allowNull: true,
    },
    // Credit side not yet applied to any item as-of periodEnd (receipts / CNs
    // unapplied) - SIGNED (normally <= 0, printed in brackets). The aging
    // buckets are pure debit-item aging since 2026-08-11:
    // sum(aging1..7) + unallocatedAmount == closingBalance.
    // (Statements generated before that folded credits into aging1 and carry
    // 0 here - the identity still holds.)
    unallocatedAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    // 'generated' | 'sent' | 'void'.
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'generated',
    },
    // Ownership stamps. Null createdBy = a scheduled run.
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: AR_SCHEMA,
    tableName: 'Statement',
    timestamps: true,
    indexes: [
        { name: 'IDX_Statement_Company_No', fields: ['companyId', 'statementNo'], unique: true },
        { name: 'IDX_Statement_Debtor_Date', fields: ['debtorId', 'statementDate'] },
        { name: 'IDX_Statement_Company_Date', fields: ['companyId', 'statementDate'] },
        // One LIVE statement per debtor per Statement Month (overwrite key).
        // Partial: void rows from before overwrite semantics existed are exempt.
        {
            name: 'IDX_Statement_Company_Debtor_Month',
            fields: ['companyId', 'debtorId', 'statementMonth'],
            unique: true,
            where: { status: { [Op.ne]: 'void' } },
        },
    ],
});

module.exports = Statement;
