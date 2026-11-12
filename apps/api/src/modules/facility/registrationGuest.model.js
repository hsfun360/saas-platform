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
    // ---- slice 6c (structures approved 2026-11-11) ----
    // The known guest, membership.Guest.id (value ref): passed to the ledger
    // so the guest counts once per host per day. NULL = a name-only line.
    guestId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // The day pass behind the line (membership.GuestRegistration.id, value
    // ref): the one the guest already held, or the one the station created.
    guestRegistrationId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // The station created the pass for this line, so removing the line
    // cancels that pass; a pass registered upfront is never cancelled here.
    passCreatedHere: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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
        { name: 'IX_FacilityRegistrationGuest_Company_Pass', fields: ['companyId', 'guestRegistrationId'] },
    ],
});

module.exports = RegistrationGuest;
