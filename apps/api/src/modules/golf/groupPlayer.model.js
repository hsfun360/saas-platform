const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.GroupPlayer (approved structure 2026-10-07, user's table name) - the
// ROSTER of a group / tournament booking: ONE row per PERSON for the whole
// booking, however many play days it spans. Keyed as the organiser sends the
// list (member no or a name), before any flight is known. The DRAW assigns a
// roster player to a flight per day, writing an ordinary golf.Player row
// (Player.groupPlayerId -> this row) - so registration, billing and no-shows
// run on golf.Player exactly as for any other booking.
const GroupPlayer = sequelize.define('GolfGroupPlayer', {
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
    // golf.Golfer identity - a member resolves at keying; a name-only guest
    // stays NULL until registration creates / matches the OtherGolfer.
    golferId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    playerName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    memberNo: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    // 'member' | 'member-guest' | 'guest' (booking.constants PLAYER_TYPE_KEYS).
    playerType: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // The organiser's declared handicap for the draw (not the club's index).
    handicap: {
        type: DataTypes.DECIMAL(4, 1),
        allowNull: true,
    },
    teamName: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    contactMobile: {
        type: DataTypes.STRING(30),
        allowNull: true,
    },
    remarks: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    // GROUP_PLAYER_STATUS_KEYS: listed | withdrawn.
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'listed',
    },
    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'GroupPlayer',
    timestamps: true,
    indexes: [
        { name: 'IX_GolfGroupPlayer_Booking', fields: ['bookingProfileId'] },
    ],
});

module.exports = GroupPlayer;
