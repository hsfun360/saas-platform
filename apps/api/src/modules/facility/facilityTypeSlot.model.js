const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// The generated slots of a FacilityTypeSlotSet (structure approved
// 2026-10-25; mirror of golf.CourseTeeTimeSlot). Generated from the header,
// then individually adjustable: a slot can be unticked (lunch break) or
// flagged front-desk-only. No ownership stamps, like the golf slot rows.
// Intra-service parent-child: slots cascade with their set.
const FacilityTypeSlot = sequelize.define('FacilityTypeSlot', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    slotSetId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // 1..n within the set.
    slotNumber: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    startTime: {
        type: DataTypes.TIME,
        allowNull: false,
    },
    // start + slotMinutes, stored so consumers never recompute.
    endTime: {
        type: DataTypes.TIME,
        allowNull: false,
    },
    // No advance booking; the station may still register a walk-in here.
    isFrontDesk: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // Unticked = the slot does not exist that day (break).
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
}, {
    schema: FACILITY_SCHEMA,
    tableName: 'FacilityTypeSlot',
    timestamps: true,
    indexes: [
        { name: 'UX_FacilityTypeSlot_Set_Number', fields: ['slotSetId', 'slotNumber'], unique: true },
    ],
});

module.exports = FacilityTypeSlot;
