const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// Facility Registration Guest (structure approved 2026-10-26, slice 3) - the
// guests on an entry, the same shape as BookingParticipant's guest lines: a
// guest at the pool draws one visit on the host's monthly allowance exactly
// as a guest on a court does. Cascades with the registration.
const RegistrationGuest = sequelize.define('FacilityRegistrationGuest', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    registrationId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The visitor's Patron when an IC or mobile was keyed; NULL for a casual
    // name; a member-as-guest line carries the member's Patron.
    patronId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // A ParticipantType code of a guest-like base.
    participantType: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    memberNo: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    // The membership.GuestVisit recorded for the line (value ref).
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
    tableName: 'RegistrationGuest',
    timestamps: true,
    indexes: [
        { name: 'IX_FacilityRegistrationGuest_Registration', fields: ['registrationId'] },
        { name: 'IX_FacilityRegistrationGuest_Company_Patron', fields: ['companyId', 'patronId'] },
    ],
});

module.exports = RegistrationGuest;
