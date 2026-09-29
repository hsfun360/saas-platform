const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// Handicap ACCOMPANIMENT rule (Tropicana procedure 2.2/2.3; user decisions
// 2026-09-29): beginners and/or provisional-handicap golfers may only play
// when the FLIGHT carries at least `minCompanions` ESTABLISHED golfers whose
// handicap index is at or below the per-gender companion cap. Scoped by day
// / course / holes / time band (2.3's "Sunday after 5 pm"), with an optional
// latest tee-off for the targeted players (2.2's "before 2 pm"). Sparse
// exception rows under GolfSetting.handicapControlEnabled, maintained on the
// Golf Specification screen (PUT-replaced atomically); most specific rule
// wins (course > holes > day scope ladder, band beats whole day).
//
// The companion is evaluated across the WHOLE flight - the booking's own
// player lines plus players already seated in the cell. ENFORCEMENT (user
// decision): booking refuses, front desk warns. Golfers with no handicap
// status recorded are NOT targeted (unrated = exempt).
const HandicapAccompanimentRule = sequelize.define('HandicapAccompanimentRule', {
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
    // Optional tee-off time band the rule covers, both-or-neither (the
    // closure-plan convention); both NULL = whole day.
    startTime: {
        type: DataTypes.TIME,
        allowNull: true,
    },
    endTime: {
        type: DataTypes.TIME,
        allowNull: true,
    },
    // Who needs accompanying (at least one must be true).
    appliesToBeginner: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    appliesToProvisional: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // "At least one" in the procedure; configurable.
    minCompanions: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
    },
    // The companion must be ESTABLISHED with an index at or below their
    // gender's cap (2.2: 24 men / 36 ladies; 2.3: 24 both).
    companionMaxHandicapMen: {
        type: DataTypes.DECIMAL(4, 1),
        allowNull: false,
    },
    companionMaxHandicapWomen: {
        type: DataTypes.DECIMAL(4, 1),
        allowNull: false,
    },
    // Targeted players may not tee off AFTER this time; NULL = none.
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
    tableName: 'HandicapAccompanimentRule',
    timestamps: true,
    indexes: [
        { name: 'IX_HandicapAccompanimentRule_Company', fields: ['companyId'] },
    ],
});

module.exports = HandicapAccompanimentRule;
