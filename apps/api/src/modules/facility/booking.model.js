const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// Facility Booking (structure approved 2026-10-25) - the HEADER only: who
// booked, how to reach them, and the lifecycle. The reservation itself is the
// BookingSlot rows (one per reserved slot), so availability counts physical
// slot occupancy and never the header. One booking = one facility type (its
// limits and fees apply as a whole); the booker is a Patron - a member or a
// visitor. Approval (a participant type or the facility type requiring it)
// parks the header 'pending-approval' with the slots held.
const Booking = sequelize.define('FacilityBooking', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // From the facility-booking numbering series at confirm.
    bookingNo: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    // Intra-service FK: the type whose rules and fees govern the booking.
    facilityTypeId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The booking maker's Patron (member or visitor).
    bookerPatronId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    contactMobile: {
        type: DataTypes.STRING(30),
        allowNull: true,
    },
    // Confirmation and cancellation emails.
    contactEmail: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },
    remarks: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // 'booked' | 'pending-approval' | 'cancelled' (booking.constants).
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'booked',
    },
    // The approval run (Workflow purpose facility-booking) while pending.
    workflowInstanceId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // 'desk' now; 'portal' when the member portal books.
    channel: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'desk',
    },
    cancelledAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    cancelledBy: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    cancelReason: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Cancelled inside the notice window while no-show control is ON; slice
    // 4 prices it.
    isLateCancel: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // Ownership stamps (RBAC data scope + workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: FACILITY_SCHEMA,
    tableName: 'Booking',
    timestamps: true,
    indexes: [
        { name: 'UX_FacilityBooking_Company_No', fields: ['companyId', 'bookingNo'], unique: true },
        { name: 'IX_FacilityBooking_Company_Booker', fields: ['companyId', 'bookerPatronId'] },
        { name: 'IX_FacilityBooking_Company_Status', fields: ['companyId', 'status'] },
    ],
});

module.exports = Booking;
