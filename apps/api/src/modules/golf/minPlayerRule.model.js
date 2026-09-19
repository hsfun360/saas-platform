const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// Minimum-players exception rule (spec 2.2.12; user decisions 2026-09-19).
// The GENERAL minimums live on GolfSetting (minPlayersWeekday/Weekend); these
// sparse rows exist only where a club wants a different minimum for a course,
// a day type, or a time band (e.g. afternoon flights accept fewer players).
// Resolution at booking time picks the MOST SPECIFIC matching rule: specific
// course beats every-course (courseId NULL - the platform NULL-discriminator
// pattern), a time band beats whole-day, exact dayScope beats 'all'; no match
// falls back to the GolfSetting numbers. ENFORCEMENT (binding): a booking
// passes when its OWN player count meets the minimum OR joining brings the
// flight's total to the minimum (merge OFF degenerates to per-booking).
// Rows are PUT-replaced atomically from the Golf Specification screen.
const MinPlayerRule = sequelize.define('MinPlayerRule', {
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
    // all | weekday | weekend - the shared day vocabulary (public holidays
    // count as weekend, classified via platform/calendarGateway.js).
    dayScope: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'all',
    },
    // Optional time band, both-or-neither (closure-plan convention); both
    // NULL = whole day. A booking's tee time falls in [startTime, endTime).
    startTime: {
        type: DataTypes.TIME,
        allowNull: true,
    },
    endTime: {
        type: DataTypes.TIME,
        allowNull: true,
    },
    minPlayers: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { min: 1, max: 10 },
    },
    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'MinPlayerRule',
    timestamps: true,
    indexes: [
        { name: 'IX_MinPlayerRule_Company', fields: ['companyId'] },
    ],
});

module.exports = MinPlayerRule;
