const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// One concrete closure day of a UnitCourseClosurePlan (spec 2.2.8's
// "具体封场计划"). Generated from the plan header (each date in the period
// matching the day scope), then hand-adjusted: per-day times, or unticked
// (isActive false) to except a single day without deleting it. Replaced
// atomically via PUT, like tee-time slots. The whole day row closes the
// plan's ONE nine - there is no per-day scope any more.
const UnitCourseClosureDay = sequelize.define('UnitCourseClosureDay', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    closurePlanId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    closureDate: {
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
}, {
    schema: GOLF_SCHEMA,
    tableName: 'UnitCourseClosureDay',
    timestamps: true,
    indexes: [
        { name: 'UX_UnitCourseClosureDay_Plan_Date', fields: ['closurePlanId', 'closureDate'], unique: true },
    ],
});

module.exports = UnitCourseClosureDay;
