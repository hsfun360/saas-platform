const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// Facility Bill Item (structure approved 2026-10-25) - one charged line: the
// transaction type, the slot it belongs to (per-slot and per-participant
// lines) and the participant it is for (per-participant lines), with the
// price and tax snapshot. Cascades with the bill.
const BillItem = sequelize.define('FacilityBillItem', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    billId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    transactionTypeId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // NULL on booking-level and manual lines.
    bookingSlotId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    bookingParticipantId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // Code + description snapshot.
    description: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
    },
    unitAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    // quantity x unitAmount after any permitted override.
    amount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    priceOverridden: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // Tax snapshot, as golf.
    taxSchemeCode: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    taxAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    taxBreakdown: {
        type: DataTypes.JSONB,
        allowNull: true,
    },
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: FACILITY_SCHEMA,
    tableName: 'BillItem',
    timestamps: true,
    indexes: [
        { name: 'IX_FacilityBillItem_Bill', fields: ['billId'] },
    ],
});

module.exports = BillItem;
