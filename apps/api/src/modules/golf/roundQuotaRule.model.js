const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.RoundQuotaRule (spec 2.3.5; approved 2026-10-15) - the MAXIMUM ROUNDS
// a player category may book per calendar period, by day type. The row
// targets EITHER a player type (`playerTypeId`, optionally refined to one
// membership type) OR an affiliated club (`affiliatedClubId`). Resolution
// picks the most specific matching row (club > type; named membership type >
// all; specific day > weekday/weekend > all); no row = no cap. Rounds =
// starting-nine Player records booked or registered for the golfer inside
// the period on days the rule's scope covers. `maxGuestRounds` caps, over
// the same period, the guest lines on bookings the golfer made (NULL = no
// cap). Stored even while GolfSetting.playingRightsEnabled is OFF, effective
// only while ON; PUT-replaced atomically from Golf Specification.
const RoundQuotaRule = sequelize.define('GolfRoundQuotaRule', {
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
    membershipTypeId: { type: DataTypes.UUID, allowNull: true },
    // all | weekday | weekend | monday..sunday.
    dayScope: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'all',
    },
    // week | month | year (playingRights.constants QUOTA_PERIODS).
    period: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'month',
    },
    maxRounds: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    maxGuestRounds: { type: DataTypes.INTEGER, allowNull: true },
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
    tableName: 'RoundQuotaRule',
    timestamps: true,
    indexes: [
        { name: 'IX_GolfRoundQuotaRule_Company', fields: ['companyId'] },
    ],
});

module.exports = RoundQuotaRule;
