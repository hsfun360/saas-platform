const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// Facility Slot Lock (structure approved 2026-10-25) - golf's FlightLock with
// the slot in place of the flight. Clicking slots on the grid claims them for
// the Specification's bookingLockMinutes; confirm converts the group's locks
// into BookingSlot rows inside one transaction; expiry, back-out and cancel
// release them. The unique cell index makes two desks claiming the same slot
// a clean 409. Short-lived: no ownership stamps.
const SlotLock = sequelize.define('FacilitySlotLock', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The one booking being keyed (several slots share it).
    groupId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    facilityId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    bookingDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    startTime: {
        type: DataTypes.TIME,
        allowNull: false,
    },
    expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    // The user keying.
    lockedBy: {
        type: DataTypes.UUID,
        allowNull: false,
    },
}, {
    schema: FACILITY_SCHEMA,
    tableName: 'SlotLock',
    timestamps: true,
    indexes: [
        { name: 'UX_FacilitySlotLock_Cell', fields: ['companyId', 'facilityId', 'bookingDate', 'startTime'], unique: true },
        { name: 'IX_FacilitySlotLock_Group', fields: ['groupId'] },
    ],
});

module.exports = SlotLock;
