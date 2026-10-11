const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.GroupWaitlist (approved structure 2026-10-11) - a group booking's
// place in the QUEUE for a course on a date that another group holds. Fair
// play between competing groups: when the holding booking's space frees
// (hold expired, rejected, lapsed, cancelled, play day removed) the FIRST
// waiting entry is OFFERED the day for an exclusive window (Golf
// Specification "next in line hours"); only that booking may reserve group
// flights on the course that day until the window ends or it reserves
// (members' ordinary bookings are never blocked - the queue is between
// groups). An unanswered offer expires and the next entry is offered.
//   waiting   - in the queue (position = order of joining)
//   offered   - the day is free and held for this booking until offerExpiresAt
//   taken     - the booking reserved its flights on the day
//   expired   - the offer window passed unanswered
//   withdrawn - the booking left the queue (or was cancelled / lapsed)
const GroupWaitlist = sequelize.define('GolfGroupWaitlist', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
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
    // The waiting booking and the play day of it that wants this course/date.
    bookingProfileId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    groupPlayDayId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Order of joining for the (course, date) queue; never reused.
    position: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    // WAITLIST_STATUS_KEYS (groupBooking.constants).
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'waiting',
    },
    offeredAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    offerExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    closedAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    remarks: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'GroupWaitlist',
    timestamps: true,
    indexes: [
        { name: 'IX_GolfGroupWaitlist_Company_Course_Date', fields: ['companyId', 'courseId', 'playDate', 'status'] },
        { name: 'IX_GolfGroupWaitlist_Booking', fields: ['bookingProfileId'] },
        { name: 'IX_GolfGroupWaitlist_Offer', fields: ['status', 'offerExpiresAt'] },
    ],
});

module.exports = GroupWaitlist;
