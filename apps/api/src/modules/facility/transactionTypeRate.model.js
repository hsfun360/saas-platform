const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// facility.TransactionTypeRate (structure approved 2026-10-25) - the
// effective-dated price card of a transaction type. Resolution at billing:
// the ACTIVE card with the latest effective date on or before the booking
// date. Matrix charge types (facility-fee / guest-fee) price through their
// TransactionTypeRateCell rows (participant x day scope x session); flat
// charge types carry one `flatAmount`. Amounts are tax-exclusive. A future-
// dated card may be deleted; one already in force is history (disable
// instead). Intra-service FK, cascades with the type.
const TransactionTypeRate = sequelize.define('FacilityTransactionTypeRate', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    transactionTypeId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    effectiveDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // Flat charge types only; NULL on matrix types.
    flatAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: true,
    },
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
    schema: FACILITY_SCHEMA,
    tableName: 'TransactionTypeRate',
    timestamps: true,
    indexes: [
        { name: 'UX_FacilityTransactionTypeRate_Type_Date', fields: ['transactionTypeId', 'effectiveDate'], unique: true },
    ],
});

module.exports = TransactionTypeRate;
