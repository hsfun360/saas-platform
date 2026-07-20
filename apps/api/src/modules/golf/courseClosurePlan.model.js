const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// Course Closure Plan (spec 2.2.8) - the RULE header: over a date period, on
// the matching day types, part or all of the course closes for a daily time
// window. The rule is expanded ("generated") into per-day CourseClosureDay
// rows the user reviews and saves - the same header -> generated-rows shape as
// the tee-time sets. Day classification (weekday/weekend, holidays = weekend)
// comes from the Control Plane via platform/calendarGateway.js at generation
// time; the saved day rows are the operational truth the tee sheet consumes.
const CourseClosurePlan = sequelize.define('CourseClosurePlan', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // Parent 18-hole course (intra-service FK, cascades).
    courseId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The reason, e.g. 'Greens maintenance', 'Club tournament'.
    description: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // 'all' | 'weekday' | 'weekend' - which day types inside the period close.
    // PUBLIC HOLIDAYS ARE TREATED AS WEEKEND (courseTeeTime.constants DAY_SCOPES).
    dayScope: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // 'first-nine' | 'second-nine' | 'all' - courseClosure.constants NINE_SCOPES.
    nineScope: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    dateFrom: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    dateTo: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // Daily closure window; BOTH NULL = closed the whole day.
    startTime: {
        type: DataTypes.TIME,
        allowNull: true,
    },
    endTime: {
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
    tableName: 'CourseClosurePlan',
    timestamps: true,
    indexes: [
        { name: 'IDX_CourseClosurePlan_Course', fields: ['courseId'] },
    ],
});

module.exports = CourseClosurePlan;
