const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.PlayingRightRule (spec 2.3.4; approved 2026-10-15) - a WHITELIST row:
// which courses, day types, time bands and dates a player category may play.
// The row targets EITHER a player type (`playerTypeId`, optionally refined
// to one membership type for member-base types) OR an affiliated club
// (`affiliatedClubId` - its visitors). A target with NO rows is
// unrestricted; with rows, a line of that target may only play inside at
// least one row. Club rules outrank type rules at resolution. Stored even
// while GolfSetting.playingRightsEnabled is OFF, effective only while ON;
// PUT-replaced atomically from Golf Specification. All refs are plain UUIDs.
const PlayingRightRule = sequelize.define('GolfPlayingRightRule', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    playerTypeId: { type: DataTypes.UUID, allowNull: true },
    affiliatedClubId: { type: DataTypes.UUID, allowNull: true },
    // Member-base refinement: NULL = every membership type of that player type.
    membershipTypeId: { type: DataTypes.UUID, allowNull: true },
    // A specific 18-hole course; NULL = every course.
    courseId: { type: DataTypes.UUID, allowNull: true },
    // all | weekday | weekend | monday..sunday (public holidays = weekend).
    dayScope: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'all',
    },
    // Optional time band, both-or-neither; a tee time falls in [start, end).
    startTime: { type: DataTypes.TIME, allowNull: true },
    endTime: { type: DataTypes.TIME, allowNull: true },
    // Optional validity of the right; NULL = permanent.
    effectiveFrom: { type: DataTypes.DATEONLY, allowNull: true },
    effectiveTo: { type: DataTypes.DATEONLY, allowNull: true },
    sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100,
    },
    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'PlayingRightRule',
    timestamps: true,
    indexes: [
        { name: 'IX_GolfPlayingRightRule_Company', fields: ['companyId'] },
    ],
});

module.exports = PlayingRightRule;
