const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// Facility Registration (structure approved 2026-10-26, slice 3) - ONE person
// in a facility: the check-in of a booked slot (bookingSlotId set, the slot
// flips to checked-in in the same transaction) or a walk-in entry on an entry
// type (bookingSlotId NULL). Visitors never register on their own - they are
// RegistrationGuest rows under a member's registration, so the guest rules
// and the monthly allowance cover every non-member in the building. The
// registration number issues from the facility-registration series.
const Registration = sequelize.define('FacilityRegistration', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    registrationNo: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    // The member registering (the booker of a checked-in slot).
    patronId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    facilityTypeId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The unit (the court of a slot, a specific pool); NULL = the type as a
    // whole (the gym counted under the type's capacity).
    facilityId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // The slot checked in; NULL = a walk-in entry.
    bookingSlotId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // The club-local date: the day's register and the capacity window.
    registrationDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    timeIn: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    // NULL = still inside.
    timeOut: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    // 'weekday' | 'weekend' as classified at registration.
    dayType: {
        type: DataTypes.STRING(10),
        allowNull: false,
    },
    // The Facility Session timeIn falls in (the fee cell); NULL = none.
    sessionId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // Denormalised count of the RegistrationGuest rows.
    guestCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    // 'in' | 'out'.
    status: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'in',
    },
    // The bill a walk-in entry opened; a checked-in slot bills on its booking.
    billId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    remarks: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: FACILITY_SCHEMA,
    tableName: 'Registration',
    timestamps: true,
    indexes: [
        { name: 'UX_FacilityRegistration_Company_No', fields: ['companyId', 'registrationNo'], unique: true },
        { name: 'IX_FacilityRegistration_Company_Type_Date', fields: ['companyId', 'facilityTypeId', 'registrationDate'] },
        { name: 'IX_FacilityRegistration_Company_Patron_Date', fields: ['companyId', 'patronId', 'registrationDate'] },
        { name: 'UX_FacilityRegistration_Slot', fields: ['bookingSlotId'], unique: true, where: { bookingSlotId: { [Op.ne]: null } } },
    ],
});

module.exports = Registration;
