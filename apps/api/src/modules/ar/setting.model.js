const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { AR_SCHEMA } = require('../../platform/schemas');

// Setting - per-company AR options singleton (approved 2026-08-06). Maintained
// on the AR Specification screen (/ar/settings).
//
// statementCutoffDay: the statement period rule. Day D means Statement Month
// M defaults to (prev month's day D + 1) .. (month M's day D), clamped to
// short months; NULL = calendar month (1st..last). Users can still override
// the dates per run.
//
// aging1..aging6: upper DAY boundaries of the statement aging buckets, filled
// left-to-right with no gaps, strictly ascending (e.g. 30,60,90,120,null,null
// prints <=30, 31-60, 61-90, 91-120, >120). Not every company practices
// 30/60/90, so the boundaries are user-defined, not a fixed interval.
//
// statement* layout options (Level 1 layout parameterization, 2026-08-11):
// the STANDARD PDF layout stays code-maintained; these per-company options
// brand and trim it (logo, accent colour, section toggles, remittance text).
// Structural per-company layouts are the future Level 2 (layout-as-data,
// EmailTemplate-style platform-default + override) - never per-company code.
const Setting = sequelize.define('ArSetting', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
    },
    statementCutoffDay: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    aging1: { type: DataTypes.INTEGER, allowNull: true },
    aging2: { type: DataTypes.INTEGER, allowNull: true },
    aging3: { type: DataTypes.INTEGER, allowNull: true },
    aging4: { type: DataTypes.INTEGER, allowNull: true },
    aging5: { type: DataTypes.INTEGER, allowNull: true },
    aging6: { type: DataTypes.INTEGER, allowNull: true },
    // --- Statement layout (Level 1) ---
    // Print the club logo (Company.logo) on the letterhead when one exists.
    statementShowLogo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    // '#rrggbb' accent for the title + band fills; NULL = the neutral standard.
    statementBrandColor: { type: DataTypes.STRING(7), allowNull: true },
    statementShowAging: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    statementShowDeposit: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    statementShowIncurredBy: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    statementShowGeneratedNote: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    // Remittance advice / payment instructions printed above the footer.
    statementFooterText: { type: DataTypes.TEXT, allowNull: true },
    // Lines-table column layout: ordered array of visible columns
    // [{ key: 'date'|'docNo'|'details'|'debit'|'credit'|'balance', label? }].
    // NULL = the standard order/labels. Hidden columns are simply omitted;
    // widths scale automatically to fill the page.
    statementColumns: { type: DataTypes.JSONB, allowNull: true },
    // --- Membership integration (2026-08-15) ---
    // Does the Membership module bill through AR (fee runs + standing charges
    // post as AR documents, collected after the statement)? ORTHOGONAL to
    // Club Specification's creditFacilityEnabled (frontend charge-to-account)
    // - all four combinations are legitimate customer types. Only meaningful
    // (and only shown) when the company is entitled to Membership Management.
    membershipIntegration: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // Designated catalog entries (ar.TransactionType ids): which type the
    // interest run posts under, and which Credit Note type deposit
    // conversions post under. Explicit configuration - selection is never
    // inferred from a category.
    interestTransactionTypeId: { type: DataTypes.UUID, allowNull: true },
    depositConversionTransactionTypeId: { type: DataTypes.UUID, allowNull: true },
    // Ownership stamps.
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: AR_SCHEMA,
    tableName: 'Setting',
    timestamps: true,
});

module.exports = Setting;
