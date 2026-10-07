const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// Booking PROFILE (revamp 2026-09-29, renamed from golf.Booking) - the
// booking-related info only: who booked, contact, remarks, lifecycle. The
// flight placement (course, nines, tee times, holes) deliberately lives on
// the golf.Player records, one per golfer per NINE, so availability counts
// physical nine occupancy - the model a composite-rotation club (Tropicana)
// needs, where one course's crossover lands on the nine another course
// starts on. `bookingType` 'flight' is the ordinary booking; 'group' and
// 'tournament' (2026-10-07) are the GROUP BOOKING header - the group folio:
// its play days (golf.GroupPlayDay, each its own course and start format),
// reserved flights (golf.GroupFlight), roster (golf.GroupPlayer), group bill,
// deposit bills and refund requests all hang off this row.
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
    // 'flight' | 'group' | 'tournament' (groupBooking.constants).
    bookingType: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'flight',
    },
    // The rotation course being played. NULL for group types (each
    // GroupPlayDay names its own course - the multi-course case the
    // 2026-09-29 decision reserved the relaxation for).
    courseId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // Ordinary booking: the play date. Group types: the FIRST play day
    // (listings sort on it); `playDateTo` is the last.
    playDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    playDateTo: {
        type: DataTypes.DATEONLY,
        allowNull: true,
    },
    // The booking maker's golf.Golfer identity (member found-or-created
    // lazily at first booking, like AR Debtor provisioning). NULL for a
    // group booking organised by a non-member (travel agent, society).
    bookerGolferId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    contactMobile: {
        type: DataTypes.STRING(30),
        allowNull: true,
    },
    // ---- group / tournament header (approved 2026-10-07) ----
    groupName: {
        type: DataTypes.STRING(150),
        allowNull: true,
    },
    // Display snapshot of the organiser (the Other Debtor's name, the
    // member's name, or a keyed name when no account is involved).
    organiserName: {
        type: DataTypes.STRING(150),
        allowNull: true,
    },
    // The BILLING PARTY for charge-to-account tenders on the folio: an AR
    // ledger account ('other' + OtherDebtor id, or 'membership' / 'member' +
    // the member's charge target). Both NULL = cash-only organiser.
    debtorType: {
        type: DataTypes.STRING(20),
        allowNull: true,
    },
    debtorSourceId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    contactPerson: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    expectedPlayers: {
        type: DataTypes.INTEGER,
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
