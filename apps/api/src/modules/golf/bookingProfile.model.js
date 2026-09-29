const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// Booking PROFILE (revamp 2026-09-29, renamed from golf.Booking) - the
// booking-related info only: who booked, contact, remarks, lifecycle. The
// flight placement (course, nines, tee times, holes) deliberately lives on
// the golf.Player records, one per golfer per NINE, so availability counts
// physical nine occupancy - the model a composite-rotation club (Tropicana)
// needs, where one course's crossover lands on the nine another course
// starts on. `bookingType` is the extension point for Group / Tournament
// bookings later ('flight' today).
const BookingProfile = sequelize.define('GolfBookingProfile', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Issued from the 'golf-booking' numbering series at confirm.
    bookingNo: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    // 'flight' today; 'group' | 'tournament' later.
    bookingType: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'flight',
    },
    // The rotation course being played (kept on the header - user decision
    // 2026-09-29; relax to NULL only when multi-course booking types arrive).
    courseId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    playDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // The booking maker's golf.Golfer identity (member found-or-created
    // lazily at first booking, like AR Debtor provisioning).
    bookerGolferId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    contactMobile: {
        type: DataTypes.STRING(30),
        allowNull: true,
    },
    remarks: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // 'booked' | 'cancelled' (booking.constants BOOKING_STATUS_KEYS).
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'booked',
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
    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'BookingProfile',
    timestamps: true,
    indexes: [
        { name: 'UX_GolfBookingProfile_Company_No', fields: ['companyId', 'bookingNo'], unique: true },
        { name: 'IX_GolfBookingProfile_Company_Date', fields: ['companyId', 'playDate'] },
    ],
});

module.exports = BookingProfile;
