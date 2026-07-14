const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// Course master file (spec 2.2.4 球场设置) - per company (club). An 18-hole
// course is a PAIRING of unit courses: one as the FIRST nine (前九洞, an OUT
// unit course) and one as the SECOND nine (后九洞, an IN unit course), plus
// optional fallbacks - an ALTERNATE nine (备用九洞, used when the first or
// second is temporarily unavailable) and a NIGHT nine (夜光场九洞, where play
// moves after dark if the current nine has no lights).
//
// Column names follow the user's business vocabulary (first/second/alternate/
// night nine, display sequence, cross over time) and stay in sync with the
// screen labels. The nine references are plain UUIDs into golf.UnitCourse
// (same service; resolved/validated in the controller, codes resolved by the
// reader via the unit-course list). Legacy 所在区域 (zone) is dropped.
const Course = sequelize.define('Course', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // The club this course belongs to (active workspace). UUID reference, no FK.
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Short business code, unique per company (e.g. 'ELS', 'WORLDCUP'). Uppercase.
    courseCode: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // Display sequence (编号) - listing/sort order.
    displaySequence: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    // Free-text name/summary, e.g. 'Els Course' (艾斯球场).
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // First nine (前九洞): a unit course of type OUT or COMPOSITE.
    firstNineId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Second nine (后九洞): a unit course of type IN or COMPOSITE.
    secondNineId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Alternate nine (备用九洞): substitute when the first/second is unavailable.
    alternateNineId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // Night nine (夜光场九洞): where play moves after dark. Must reference a
    // unit course flagged hasFloodlight.
    nightNineId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // Cross over time (换场时间): minutes from tee-off until players cross over
    // from the first nine to the second nine.
    crossOverMinutes: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    // Public URL of the course picture (球场图片), GCS - same pattern as the
    // company/platform logo.
    photo: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Whether this course is offered in pickers (tee sheets, bookings).
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'Course',
    timestamps: true,
    indexes: [
        { name: 'UX_Course_Company_Code', fields: ['companyId', 'courseCode'], unique: true },
    ],
});

module.exports = Course;
