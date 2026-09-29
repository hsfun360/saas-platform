const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.Player (revamp 2026-09-29, renamed from RegistrationPlayer and
// absorbing BookingPlayer) - ONE record = one golfer occupying ONE NINE at
// one tee time. A 9-hole play is a single record; an 18-hole play is a PAIR:
// the starting-nine record (secondNineFlag 0) and the crossover record
// (secondNineFlag 1, firstNinePlayerId -> its pair). Availability counts
// records per (unitCourseId, teeTime), so a crossover landing on the nine
// another course starts on occupies that course's cell too - the physical
// model a composite-rotation club needs.
//
// Lifecycle (registration.constants PLAYER_STATUS_KEYS):
//   booked -> registered (registrationNo issued at the desk) -> cancelled /
//   no-show. Walk-ins are created directly as 'registered' with
//   bookingProfileId NULL. Both records of a pair change status together in
//   ONE transaction; capacity counts status IN ('booked','registered').
//
// The starting-nine record is the PRIMARY: it carries the registration
// number and the bill link; the crossover record is occupancy with display
// snapshots. People-lists, quotas and billing filter secondNineFlag = 0.
// `secondNineFlag` doubles as the sort key so a pair always lists
// start-then-crossover (user decision 2026-09-29).
const Player = sequelize.define('GolfPlayer', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // NULL = walk-in (no booking).
    bookingProfileId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // 0 = starting-nine record (primary), 1 = crossover record.
    secondNineFlag: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    // Set ONLY on the crossover record -> its starting-nine record. The hard
    // pairing link (partial unique below: one crossover per pair).
    firstNinePlayerId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // The physical NINE occupied - THE availability key.
    unitCourseId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The rotation course being played (rates/billing context).
    courseId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    playDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // This record's tee-off on this nine (the crossover record's teeTime is
    // the SNAPSHOTTED cross time - a later grid change never moves it).
    teeTime: {
        type: DataTypes.TIME,
        allowNull: false,
    },
    // 'member' | 'member-guest' | 'guest' (booking.constants).
    playerType: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // golf.Golfer identity - NULL only while a name-only guest is merely
    // booked; always resolved by registration time.
    golferId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // Display snapshot: the member's name, or the keyed guest name.
    playerName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    memberNo: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    // Issued from the 'golf-registration' series at the desk; NULL while
    // only booked. Starting-nine record only.
    registrationNo: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    // 'booked' | 'registered' | 'cancelled' | 'no-show'.
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'booked',
    },
    registeredAt: {
        type: DataTypes.DATE,
        allowNull: true,
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
    tableName: 'Player',
    timestamps: true,
    indexes: [
        // Availability: one range scan per day answers every nine-cell count.
        { name: 'IX_GolfPlayer_Company_Nine_Date_Time', fields: ['companyId', 'unitCourseId', 'playDate', 'teeTime'] },
        { name: 'IX_GolfPlayer_Company_Date', fields: ['companyId', 'playDate'] },
        { name: 'IX_GolfPlayer_BookingProfile', fields: ['bookingProfileId'] },
        // Registration numbers unique per company (NULLs are distinct in PG,
        // so merely-booked records don't collide).
        { name: 'UX_GolfPlayer_Company_RegNo', fields: ['companyId', 'registrationNo'], unique: true },
        // One crossover record per starting-nine record.
        {
            name: 'UX_GolfPlayer_FirstNinePlayer',
            fields: ['firstNinePlayerId'],
            unique: true,
            where: { firstNinePlayerId: { [Op.ne]: null } },
        },
    ],
});

module.exports = Player;
