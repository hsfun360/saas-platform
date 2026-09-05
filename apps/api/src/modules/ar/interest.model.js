const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { AR_SCHEMA } = require('../../platform/schemas');

// Interest - the HOLDING header of the staged interest run (approved
// 2026-08-05; mirrors the membership-import staging pattern): the account user
// GENERATES into holding, reviews, then CONFIRMS - which posts ONE summary
// Debit Note per header. ONE header per debtor per month; the partial unique
// index is the duplicate guard (a cancelled run can be regenerated, a pending
// or confirmed one blocks the month).
//
// FORMULA (user rule): interestAmount = overdueAmount x interestRate / 100 -
// FLAT per month, no day proration; rounded half-up to 2dp PER DETAIL LINE,
// and this header's interestAmount = the sum of the rounded lines, so the
// posted summary always equals the drill-down exactly.
const Interest = sequelize.define('Interest', {
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
    // Normalized to the FIRST of the month - the "which month" key.
    periodMonth: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // Overdue is measured as at this date.
    cutoffDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // Snapshot of the flat monthly % actually applied (config-by-input; the
    // run screen collects it, the header freezes it).
    interestRate: {
        type: DataTypes.DECIMAL(7, 4),
        allowNull: false,
    },
    graceDays: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    // Multicurrency (step 5): the debtor ACCOUNT's currency - overdue and
    // interest amounts (and the posted Debit Note) are in this unit. FOREIGN
    // accounts only; NULL = the company base currency. Never total headers
    // across different currencies.
    currencyCode: {
        type: DataTypes.STRING(3),
        allowNull: true,
    },
    totalOverdue: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
    },
    interestAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
    },
    // Run-level analysis dimensions (approved 2026-09-04): the Generate form
    // collects one value per assigned dimension (required flags enforced -
    // this is an interactive action, not an exempt system producer); the
    // header FREEZES the choices and confirm stamps them onto the posted
    // interest document. The finer per-line association stays derivable via
    // InterestDetail.chargeId -> the source charge's own analysis columns.
    analysis1Id: { type: DataTypes.UUID, allowNull: true },
    analysis2Id: { type: DataTypes.UUID, allowNull: true },
    analysis3Id: { type: DataTypes.UUID, allowNull: true },
    analysis4Id: { type: DataTypes.UUID, allowNull: true },
    analysis5Id: { type: DataTypes.UUID, allowNull: true },
    analysis6Id: { type: DataTypes.UUID, allowNull: true },
    // 'pending' | 'confirmed' | 'cancelled'.
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
    },
    // Set on confirm - the summary ar.Ledger Debit Note this produced. The
    // link is TWO-WAY: this column points at the ledger row, and the posted
    // DN's generic producer columns point back (Ledger.sourceModule = 'ar',
    // Ledger.sourceRef = this header's id - the platform pattern shared with
    // offset CNs / deposit conversions, so Ledger stays producer-agnostic).
    postedLedgerId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // Ownership stamps.
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: AR_SCHEMA,
    tableName: 'Interest',
    timestamps: true,
    indexes: [
        // The month duplicate guard: cancelled rows don't block regeneration.
        {
            name: 'IDX_Interest_Month_Guard',
            fields: ['companyId', 'debtorId', 'periodMonth'],
            unique: true,
            where: { status: { [Op.ne]: 'cancelled' } },
        },
        { name: 'IDX_Interest_Company_Month', fields: ['companyId', 'periodMonth'] },
    ],
});

module.exports = Interest;
