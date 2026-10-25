const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// One concrete closure day of a FacilityClosurePlan (structure approved
// 2026-10-25; shape of golf.UnitCourseClosureDay). Generated from the plan
// header (each date in the period matching the day scope), then hand-
// adjusted: per-day times, or unticked (isActive false) to except a single
// day without deleting it. Replaced atomically via PUT. No ownership stamps.
const FacilityClosureDay = sequelize.define('FacilityClosureDay', {
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
    // Per-day window; BOTH NULL = closed the whole day.
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
    schema: FACILITY_SCHEMA,
    tableName: 'FacilityClosureDay',
    timestamps: true,
    indexes: [
        { name: 'UX_FacilityClosureDay_Plan_Date', fields: ['closurePlanId', 'closureDate'], unique: true },
    ],
});

module.exports = FacilityClosureDay;
