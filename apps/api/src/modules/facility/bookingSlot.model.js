const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// Facility Booking Slot (structure approved 2026-10-25) - ONE row per
// reserved slot of a booking: the unit, the date and the slot's times as they
// stood in the type's slot set in force that day, plus the pricing snapshot
// (session, day type). The PARTIAL unique index on (facilityId, bookingDate,
// startTime) excluding cancelled rows is what makes a double booking
// impossible even under concurrent saves; the advisory lock only keeps the
// error friendly. Cascades with its booking.
const BookingSlot = sequelize.define('FacilityBookingSlot', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    bookingId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Denormalised for the per-type limit counts.
    facilityTypeId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The unit. Intra-service FK.
    facilityId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    bookingDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // From the slot set in force on that date.
    startTime: {
        type: DataTypes.TIME,
        allowNull: false,
    },
    endTime: {
        type: DataTypes.TIME,
        allowNull: false,
    },
    // The slot's number in its set (display).
    slotNumber: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    // The Facility Session the start falls in at booking time; NULL = none.
    sessionId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // 'weekday' | 'weekend' as classified at booking time (holidays = weekend).
    dayType: {
        type: DataTypes.STRING(10),
        allowNull: false,
    },
    // 'booked' | 'checked-in' | 'no-show' | 'cancelled'.
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'booked',
    },
    // Slice 3.
    checkedInAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    // A single slot dropped from a booking.
    cancelledAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
}, {
    schema: FACILITY_SCHEMA,
    tableName: 'BookingSlot',
    timestamps: true,
    indexes: [
        {
            name: 'UX_FacilityBookingSlot_Cell_Live',
            fields: ['facilityId', 'bookingDate', 'startTime'],
            unique: true,
            where: { status: { [Op.ne]: 'cancelled' } },
        },
        { name: 'IX_FacilityBookingSlot_Company_Date', fields: ['companyId', 'bookingDate'] },
        { name: 'IX_FacilityBookingSlot_Company_Type_Date', fields: ['companyId', 'facilityTypeId', 'bookingDate'] },
        { name: 'IX_FacilityBookingSlot_Booking', fields: ['bookingId'] },
    ],
});

module.exports = BookingSlot;
