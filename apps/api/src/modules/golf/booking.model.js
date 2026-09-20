const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// Golf booking HEADER (user decisions 2026-09-20) - one confirmed flight
// claim on the DYNAMIC tee sheet. There is deliberately NO slot table: a
// booking references its flight by NATURAL KEY (courseId, playDate, nine,
// teeTime), and the 18-hole crossover leg is SNAPSHOTTED at booking time
// (crossNine/crossTime) so a later course cross-over-time change never moves
// existing flights. Occupancy of a cell = the active ('booked') bookings
// sitting on that key. Player lines live in golf.BookingPlayer (details).
//
// All availability checks, flight locks and the final save run through ONE
// service path under a Postgres advisory lock on (company, course, playDate)
// with every rule re-validated server-side: booking window, closure blocks,
// capacity under the merge rule, minimum players, guest control, lock
// ownership. The portal's member self-booking later calls the same path.
const Booking = sequelize.define('GolfBooking', {
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
    courseId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    playDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // 9 | 18 (booking.constants HOLES_OPTIONS).
    holes: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    // The flight's natural key: which nine and tee-off time the flight starts
    // on ('first' | 'second'; bookings start on the first nine today).
    startNine: {
        type: DataTypes.STRING(10),
        allowNull: false,
    },
    startTime: {
        type: DataTypes.TIME,
        allowNull: false,
    },
    // 18-hole crossover cell, snapshotted at booking time; NULL for 9 holes.
    crossNine: {
        type: DataTypes.STRING(10),
        allowNull: true,
    },
    crossTime: {
        type: DataTypes.TIME,
        allowNull: true,
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
    tableName: 'Booking',
    timestamps: true,
    indexes: [
        { name: 'UX_GolfBooking_Company_No', fields: ['companyId', 'bookingNo'], unique: true },
        { name: 'IX_GolfBooking_Company_Course_Date', fields: ['companyId', 'courseId', 'playDate'] },
    ],
});

module.exports = Booking;
