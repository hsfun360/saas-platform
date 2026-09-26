const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// Pricing of a golf Transaction Type - one row is one COMPLETE price card in
// force from `effectiveDate` (latest on-or-before the play date wins, the same
// resolution rule as CourseTeeTimeSet). Two shapes, decided by the parent's
// charge type:
//   - matrix (green-fee / caddy-fee / buggy-fee): the four 9/18 holes ×
//     weekday/weekend cells are set, `flatAmount` stays NULL. (Simplified
//     2026-09-26 from the 8-cell member/visitor matrix: the golfer category
//     moved onto the transaction type itself - one billing item per category.)
//   - flat (no-show / miscellaneous / package): only `flatAmount` is set.
// "Weekend" includes public holidays by platform-wide business rule (see
// platform/calendarGateway.js). Amounts are tax-exclusive - tax comes from the
// parent's taxSchemeCode at billing time. Whether a resolved price may be
// amended manually at billing is the PARENT's `allowPriceOverride`, not a
// per-rate setting.
//
// Same-service parent-child, so a real FK + cascade is used (association in
// wiring/associations.js), like MembershipFee -> MembershipFeeScheme.
const GolfTransactionTypeRate = sequelize.define('GolfTransactionTypeRate', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    transactionTypeId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // In force from this date (within the transaction type); unique per parent.
    effectiveDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // The 4 matrix cells - 9 vs 18 holes, weekday vs weekend/public-holiday.
    // NULL on flat-priced charge types.
    price9Weekday: { type: DataTypes.DECIMAL(21, 2), allowNull: true },
    price18Weekday: { type: DataTypes.DECIMAL(21, 2), allowNull: true },
    price9Weekend: { type: DataTypes.DECIMAL(21, 2), allowNull: true },
    price18Weekend: { type: DataTypes.DECIMAL(21, 2), allowNull: true },
    // Single price for flat charge types (no-show / miscellaneous); NULL on
    // matrix charge types.
    flatAmount: { type: DataTypes.DECIMAL(21, 2), allowNull: true },
    // Inactive rows are skipped by price resolution. Future-dated rows may be
    // hard-deleted; rows already in force are kept as history.
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'TransactionTypeRate',
    timestamps: true,
    indexes: [
        { name: 'UX_GolfTransactionTypeRate_Type_Date', fields: ['transactionTypeId', 'effectiveDate'], unique: true },
    ],
});

module.exports = GolfTransactionTypeRate;
