const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// Unit Course master file - per company (club). A unit course is a NINE-hole
// course, the building block of golf setup: an 18-hole course (Course Setup)
// pairs two of them, one as the OUT (front) nine and one as the IN (back) nine.
//
// Product-tier data: `companyId` is a plain UUID reference into the Control Plane
// (no DB-level FK), per the cross-service golden rules in docs/systems/README.md.
// Enable/disable via `isActive` rather than hard delete, since courses, tee sheets
// and bookings will reference a unit course later.
const UnitCourse = sequelize.define('UnitCourse', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // The club this unit course belongs to (active workspace). UUID reference, no FK.
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Short business code, unique per company (e.g. 'OZ', 'A'). Stored uppercase.
    unitCourseCode: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // Display/sort order on listings and pickers (spec: 编号).
    seq: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    // Free-text name/summary, e.g. 'Olazabal front nine'.
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // One of unitCourse.constants COURSE_TYPE_KEYS: 'out' | 'in' | 'composite'.
    courseType: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // Free-text remarks.
    remarks: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Normal minutes to complete this nine - feeds turn/换场 timing in Course Setup
    // and tee-time interval planning later.
    completionMinutes: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    // Whether the nine has floodlights (can be played after dark).
    hasFloodlight: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // Minutes BEFORE the configured dark time at which the lighting fee starts to
    // be charged (spec: 灯光费收取提前时间). Only meaningful when hasFloodlight.
    floodlightLeadMinutes: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    // Whether this unit course is offered in pickers (Course Setup, tee sheets).
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
}, {
    // Owned by the Golf service -> its own Postgres schema, so the whole service
    // extracts as `pg_dump --schema=golf`. See platform/schemas.js.
    schema: GOLF_SCHEMA,
    tableName: 'UnitCourse',
    timestamps: true,
    indexes: [
        { name: 'UX_UnitCourse_Company_Code', fields: ['companyId', 'unitCourseCode'], unique: true },
    ],
});

module.exports = UnitCourse;
