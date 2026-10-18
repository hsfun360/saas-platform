const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.CaddyRequest (approved 2026-10-18; the starter-hut spec's caddy
// booking and named-caddy check-in) - a player's request for a PARTICULAR
// caddy ahead of play, keyed on the flight booking (or at the desk on a
// registered golfer), optionally for one golfer of the flight. Lifecycle in
// caddy.constants REQUEST_STATUSES: requested -> confirmed (the caddy checks
// in on the day) -> fulfilled (the station assigns that caddy to that
// flight, which marks the round requestedByName); cancelled by the player
// (or with the booking) or by the caddy; lapsed when the tee time passed.
// ONE live request per caddy per play date (partial unique, user decision).
const GolfCaddyRequest = sequelize.define('GolfCaddyRequest', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // golf.Caddy (intra-service FK) + the badge snapshot.
    caddyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    caddyNo: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // The flight booking (NULL for a desk request on a walk-in) and the golfer
    // it is for (NULL = the flight as a whole) - value refs.
    bookingProfileId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    playerId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // Snapshots of the flight (refreshed when the booking moves).
    playDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    teeTime: {
        type: DataTypes.TIME,
        allowNull: true,
    },
    courseId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // 'booking' | 'desk' | 'portal' (REQUEST_SOURCE_KEYS).
    source: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'booking',
    },
    // REQUEST_STATUS_KEYS.
    status: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'requested',
    },
    requestedAt: { type: DataTypes.DATE, allowNull: false },
    requestedBy: { type: DataTypes.UUID, allowNull: true },
    confirmedAt: { type: DataTypes.DATE, allowNull: true },
    fulfilledAt: { type: DataTypes.DATE, allowNull: true },
    caddyAssignmentId: { type: DataTypes.UUID, allowNull: true },
    cancelledAt: { type: DataTypes.DATE, allowNull: true },
    cancelledBy: { type: DataTypes.UUID, allowNull: true },
    cancelReason: { type: DataTypes.STRING, allowNull: true },
    remarks: { type: DataTypes.STRING, allowNull: true },
    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'CaddyRequest',
    timestamps: true,
    indexes: [
        { name: 'IX_GolfCaddyRequest_Company_Date_Status', fields: ['companyId', 'playDate', 'status'] },
        { name: 'IX_GolfCaddyRequest_Booking', fields: ['bookingProfileId'] },
        // One live request per caddy per play date.
        {
            name: 'UX_GolfCaddyRequest_Caddy_Date_Live',
            fields: ['caddyId', 'playDate'],
            unique: true,
            where: { status: { [Op.in]: ['requested', 'confirmed'] } },
        },
    ],
});

module.exports = GolfCaddyRequest;
