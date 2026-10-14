const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.BookingChange (approved 2026-10-14) - ONE row per amendment of an
// ordinary flight booking, the booking's visible history: the flight moved
// (course / date / tee time / holes), the roster changed (players added or
// dropped), or the header edited. `before` and `after` snapshot the flight
// and the player lines as they stood on each side of the change; `summary`
// is the sentence the desk confirmed in the preview (show expected results).
// A late change inside the cancellation-notice window may raise a no-show
// charge (noShowChargeId). The booking number never changes.
const BookingChange = sequelize.define('GolfBookingChange', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    bookingProfileId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    bookingNo: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    // 1, 2, 3 ... per booking.
    changeNo: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    // 'move' | 'roster' | 'header' | 'mixed' (bookingChange.constants).
    changeType: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // { courseId, courseCode, playDate, teeTime, crossTime, holes,
    //   contactMobile, remarks, players: [{ playerName, memberNo, playerType }] }
    before: {
        type: DataTypes.JSONB,
        allowNull: false,
    },
    after: {
        type: DataTypes.JSONB,
        allowNull: false,
    },
    summary: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    reason: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // The late-change penalty raised with this change, if any.
    noShowChargeId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    changedAt: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    changedBy: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'BookingChange',
    timestamps: true,
    indexes: [
        { name: 'UX_GolfBookingChange_Booking_No', fields: ['bookingProfileId', 'changeNo'], unique: true },
        { name: 'IX_GolfBookingChange_Company_At', fields: ['companyId', 'changedAt'] },
    ],
});

module.exports = BookingChange;
