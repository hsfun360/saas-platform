const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// Facility Closure Plan (structure approved 2026-10-25; shape of
// golf.UnitCourseClosurePlan) - the RULE header: over a date period, on the
// matching day types, a Facility Type closes for a daily time window - ONE
// unit (`facilityId`) or EVERY unit of the type (`facilityId` NULL: a
// tournament, pool cleaning). The rule is expanded ("generated") into per-day
// FacilityClosureDay rows the user reviews and saves; day classification
// comes from the calendar seam at generation time and the saved day rows are
// the operational truth the booking grid and the station consume. Intra-
// service FKs: cascades with the type, RESTRICT on the unit (deleting a unit
// with plans would otherwise silently widen them to the whole type).
const FacilityClosurePlan = sequelize.define('FacilityClosurePlan', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The type that closes.
    facilityTypeId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // ONE unit; NULL = every unit of the type.
    facilityId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // 'Court resurfacing', 'Club tournament'.
    description: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // 'all' | 'weekday' | 'weekend' inside the period (holidays = weekend).
    dayScope: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'all',
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
    schema: FACILITY_SCHEMA,
    tableName: 'FacilityClosurePlan',
    timestamps: true,
    indexes: [
        { name: 'IX_FacilityClosurePlan_Type_Period', fields: ['facilityTypeId', 'dateFrom', 'dateTo'] },
        { name: 'IX_FacilityClosurePlan_Company', fields: ['companyId'] },
    ],
});

module.exports = FacilityClosurePlan;
