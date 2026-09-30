const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// Unit Course Closure Plan (spec 2.2.8, re-keyed 2026-09-30) - the RULE
// header: over a date period, on the matching day types, ONE physical nine
// closes for a daily time window. A closure is a fact about the NINE, not an
// 18-hole course: in composite rotation (Tropicana E1 -> E2 -> W3 -> E1)
// closing EAST1 must block East Course 1's tee-offs AND West Course's
// crossover landings, so the plan keys on the unit course and every course
// checks its firstNineId/secondNineId against the nine's blocks. (The old
// per-course nineScope let the same physical closure be entered two ways
// with different effects.) The rule is expanded ("generated") into per-day
// UnitCourseClosureDay rows the user reviews and saves - the same header ->
// generated-rows shape as the tee-time sets. Day classification
// (weekday/weekend, holidays = weekend) comes from the Control Plane via
// platform/calendarGateway.js at generation time; the saved day rows are the
// operational truth the tee sheet consumes.
const UnitCourseClosurePlan = sequelize.define('UnitCourseClosurePlan', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // The physical nine that closes (intra-service FK, cascades).
    unitCourseId: {
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
    tableName: 'UnitCourseClosurePlan',
    timestamps: true,
    indexes: [
        { name: 'IDX_UnitCourseClosurePlan_Nine', fields: ['unitCourseId'] },
    ],
});

module.exports = UnitCourseClosurePlan;
