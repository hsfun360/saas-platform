const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// One tee-off time setup of a COURSE (spec 2.2.5/2.2.6, collapsed per the
// user's direction: flight time is a property of the course itself - a walking
// course sets a longer interval, an unlit course a shorter day - so there is no
// shared rule catalog). A course holds several sets: `effectiveDate` handles
// seasonal daylight changes, `dayScope` handles weekday/weekend differences.
//
// Runtime resolution (tee sheet generation later): for a course + play date,
// pick the active set whose dayScope matches and whose effectiveDate is the
// latest on-or-before the play date.
const CourseTeeTimeSet = sequelize.define('CourseTeeTimeSet', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    courseId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Optional label, e.g. 'Summer schedule'.
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // One of courseTeeTime.constants DAY_SCOPE_KEYS: 'all' | 'weekday' | 'weekend'.
    // Public holidays count as weekend by business rule.
    dayScope: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'all',
    },
    // From this date on, this set is the one in force (within its day scope).
    effectiveDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // First and last tee-off of the day (第一个/最后一个开球时间).
    firstTeeTime: {
        type: DataTypes.TIME,
        allowNull: false,
    },
    lastTeeTime: {
        type: DataTypes.TIME,
        allowNull: false,
    },
    // Flight time interval in minutes (开球间隔时间).
    intervalMinutes: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    // Players per flight (每组人数) - the default max for generated slots.
    playersPerFlight: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    // Tee-offs up to this time must play 18 holes (必打18洞时间).
    mustPlay18Until: {
        type: DataTypes.TIME,
        allowNull: true,
    },
    // Tee-offs up to this time must play at least 9 holes (必打9洞时间).
    mustPlay9Until: {
        type: DataTypes.TIME,
        allowNull: true,
    },
    // Slots at/after this time are reserved for the front desk (前台时间).
    frontDeskFrom: {
        type: DataTypes.TIME,
        allowNull: true,
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'CourseTeeTimeSet',
    timestamps: true,
    indexes: [
        { name: 'UX_CourseTeeTimeSet_Course_Scope_Date', fields: ['courseId', 'dayScope', 'effectiveDate'], unique: true },
    ],
});

module.exports = CourseTeeTimeSet;
