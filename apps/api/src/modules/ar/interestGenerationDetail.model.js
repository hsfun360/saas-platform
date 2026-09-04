const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { AR_SCHEMA } = require('../../platform/schemas');

// InterestGenerationDetail - one row per overdue open item considered by an
// interest generation (approved 2026-08-05). The PERMANENT drill-down/audit of
// how the summary figure was computed - details are never deleted after
// posting. Only charges with isInterestChargeable, past due after grace, on
// debtors with chargeInterest, produce rows.
const InterestGenerationDetail = sequelize.define('InterestGenerationDetail', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Intra-service parent (validated in the service, no FK - consistent style).
    interestGenerationId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The overdue ar.Ledger debit row.
    chargeId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Review-screen display snapshots.
    docNo: {
        type: DataTypes.STRING(30),
        allowNull: false,
    },
    docDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    dueDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // The item's remaining (gross - settled) at cutoff.
    overdueAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
    },
    // INFORMATIONAL only (cutoff - dueDate - graceDays); the flat formula does
    // not use it.
    overdueDays: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    // overdueAmount x rate/100, half-up to 2dp per line.
    interestAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
    },
    // Pre-post maintenance (approved 2026-09-04): a line can be EXCLUDED from
    // a pending run (and restored) instead of hard-deleted - the audit keeps
    // what was considered and removed. Excluded lines never contribute to the
    // header totals or the posted Debit Note.
    isExcluded: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    excludedBy: { type: DataTypes.UUID, allowNull: true },
    excludedAt: { type: DataTypes.DATE, allowNull: true },
}, {
    schema: AR_SCHEMA,
    tableName: 'InterestGenerationDetail',
    timestamps: true,
    indexes: [
        { name: 'IDX_InterestGenerationDetail_Parent', fields: ['interestGenerationId'] },
        { name: 'IDX_InterestGenerationDetail_Company', fields: ['companyId'] },
    ],
});

module.exports = InterestGenerationDetail;
