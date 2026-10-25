const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// Facility Booking Participant (structure approved 2026-10-25) - the people
// on ONE slot. A member participant is a Patron; a visitor guest may be a
// Patron (found or created at the desk) or a plain name when the desk keys a
// casual guest. `isHost` marks the member whose monthly guest allowance the
// guests draw on (the booker by default); `guestVisitId` is the value ref of
// the membership.GuestVisit row recorded for a guest line through the seam.
// Cascades with its slot.
const BookingParticipant = sequelize.define('FacilityBookingParticipant', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    bookingSlotId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // NULL for a named casual guest.
    patronId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // A ParticipantType code.
    participantType: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // Snapshot.
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // Snapshot, members only.
    memberNo: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    isHost: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    guestVisitId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
    },
}, {
    schema: FACILITY_SCHEMA,
    tableName: 'BookingParticipant',
    timestamps: true,
    indexes: [
        { name: 'IX_FacilityBookingParticipant_Slot', fields: ['bookingSlotId'] },
        { name: 'IX_FacilityBookingParticipant_Company_Patron', fields: ['companyId', 'patronId'] },
    ],
});

module.exports = BookingParticipant;
