const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// Handicap LIMIT rule (Tropicana procedure 2.1; user decisions 2026-09-29):
// the maximum handicap index allowed to play, scoped by day / course / holes
// / gender, with an optional latest tee-off time for the targeted players.
// Sparse exception rows under GolfSetting.handicapControlEnabled (the master
// switch - rows are STORED while OFF, EFFECTIVE only while ON), maintained
// on the Golf Specification screen (PUT-replaced atomically). Resolution
// picks the MOST SPECIFIC matching rule per player: course > holes > gender
// > day scope ladder (specific day > weekday/weekend > all).
//
// ENFORCEMENT (user decision): the BOOKING channel refuses violations; the
// front desk registers with a WARNING (the desk stays seats-authoritative).
// Golfers with NO handicap index recorded are exempt from the cap; a golfer
// with unknown gender is checked against the stricter matching cap.
const HandicapLimitRule = sequelize.define('HandicapLimitRule', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // A specific 18-hole course; NULL = every course. Plain UUID value ref.
    courseId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // all | weekday | weekend | monday..sunday (golfSetting DAY_SCOPES).
    dayScope: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'all',
    },
    // 9 | 18; NULL = any holes.
    holes: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    // 'men' | 'women' | 'any'.
    gender: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'any',
    },
    // The player's handicapIndex must be at or below this.
    maxHandicap: {
        type: DataTypes.DECIMAL(4, 1),
        allowNull: false,
    },
    // Players this rule targets may not tee off AFTER this time (procedure
    // 2.1's "must tee-off before 2.29 pm"); NULL = no time restriction.
    latestTeeOff: {
        type: DataTypes.TIME,
        allowNull: true,
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'HandicapLimitRule',
    timestamps: true,
    indexes: [
        { name: 'IX_HandicapLimitRule_Company', fields: ['companyId'] },
    ],
});

module.exports = HandicapLimitRule;
