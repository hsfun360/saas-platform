const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// One slot definition of a SLOT-mode Facility Type (structure approved
// 2026-10-25; mirror of golf.CourseTeeTimeSet). The type owns several sets:
// `effectiveDate` handles seasonal changes, `dayScope` weekday / weekend
// differences. Resolution for a type + date: the active set whose dayScope
// matches (an exact weekday / weekend set outranks 'all') and whose
// effectiveDate is the latest on or before the date. Slots are generated
// from the header (first start + slotMinutes up to the last start), reviewed,
// then saved as FacilityTypeSlot rows. Intra-service FK, cascades with the
// type (wiring/associations.js).
const FacilityTypeSlotSet = sequelize.define('FacilityTypeSlotSet', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    facilityTypeId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Optional label, e.g. 'Weekend schedule'.
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // 'all' | 'weekday' | 'weekend' (holidays = weekend).
    dayScope: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'all',
    },
    // In force from this date within its scope.
    effectiveDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // Start of the first and of the last slot.
    firstSlotTime: {
        type: DataTypes.TIME,
        allowNull: false,
    },
    lastSlotTime: {
        type: DataTypes.TIME,
        allowNull: false,
    },
    // Slot length in minutes (15-240); every slot of the set has it.
    slotMinutes: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    // Slots starting at or after this time default to front-desk-only.
    frontDeskFrom: {
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
    tableName: 'FacilityTypeSlotSet',
    timestamps: true,
    indexes: [
        { name: 'UX_FacilityTypeSlotSet_Type_Scope_Date', fields: ['facilityTypeId', 'dayScope', 'effectiveDate'], unique: true },
    ],
});

module.exports = FacilityTypeSlotSet;
