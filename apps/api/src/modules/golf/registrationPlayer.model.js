const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// Front-desk REGISTRATION - ONE table, one row per registered golfer, each
// with their OWN Registration No. (user decisions 2026-09-26: no group
// header; bills are per player, so registration is per player too).
//
// Two arrival paths:
//   - BOOKED player: bookingId + bookingPlayerId set (a booking line
//     registers at most once - partial unique below); flight fields snapshot
//     from the booking.
//   - WALK-IN: bookingId/bookingPlayerId NULL - a first-class row carrying
//     its flight by natural key. OCCUPANCY COUNTS WALK-INS: availability
//     unions active bookings AND walk-in registrations per cell (both legs
//     for 18 holes) under the same advisory lock, so booking can never
//     oversell a flight walk-ins already filled. The desk checks SEATS ONLY -
//     merge/min-players/guest-control are booking-channel rules; the front
//     desk is authoritative for who physically tees off.
//
// `golferId` is always resolved by registration time: members already have
// identities; guests get their OtherGolfer created/matched (dedupe by
// identity no / mobile) at the desk. Member standing (actionControl) is
// re-checked live; barred members are refused.
const RegistrationPlayer = sequelize.define('GolfRegistrationPlayer', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Issued from the 'golf-registration' numbering series.
    registrationNo: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    bookingId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    bookingPlayerId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // Flight snapshot (walk-ins carry their flight without a booking).
    courseId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    playDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    nine: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'first',
    },
    teeTime: {
        type: DataTypes.TIME,
        allowNull: false,
    },
    crossNine: {
        type: DataTypes.STRING(10),
        allowNull: true,
    },
    crossTime: {
        type: DataTypes.TIME,
        allowNull: true,
    },
    holes: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    // The golfer identity (always resolved at the desk) + display snapshots.
    golferId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    playerType: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    playerName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    memberNo: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    // 'registered' | 'cancelled' (registration.constants).
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'registered',
    },
    registeredAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
    cancelledAt: { type: DataTypes.DATE, allowNull: true },
    cancelledBy: { type: DataTypes.UUID, allowNull: true },
    cancelReason: { type: DataTypes.STRING, allowNull: true },
    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'RegistrationPlayer',
    timestamps: true,
    indexes: [
        { name: 'UX_GolfRegistrationPlayer_Company_No', fields: ['companyId', 'registrationNo'], unique: true },
        { name: 'IX_GolfRegistrationPlayer_Company_Date', fields: ['companyId', 'playDate'] },
        // A booking line registers at most once (walk-ins have NULL and are
        // exempt from the partial unique).
        {
            name: 'UX_GolfRegistrationPlayer_BookingPlayer',
            fields: ['bookingPlayerId'],
            unique: true,
            where: { bookingPlayerId: { [Op.ne]: null } },
        },
    ],
});

module.exports = RegistrationPlayer;
