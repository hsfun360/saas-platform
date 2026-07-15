const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// The generated flight times of a tee-time set (spec 2.2.6 detail). Generated
// from the header (first/last time + interval), then individually adjustable -
// time, max players and the front-desk flag are all editable per slot.
//
// Intra-service parent-child: slots cascade with their set - see
// wiring/associations.js.
const CourseTeeTimeSlot = sequelize.define('CourseTeeTimeSlot', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    teeTimeSetId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Slot number (编号), unique within the set.
    slotNumber: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    // Tee-off time of this flight (时间).
    teeTime: {
        type: DataTypes.TIME,
        allowNull: false,
    },
    // Max players for this flight (人数).
    maxPlayers: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    // Front-desk-only slot (前台时间): visible to other modules, allocatable
    // only by the front desk.
    isFrontDesk: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'CourseTeeTimeSlot',
    timestamps: true,
    indexes: [
        { name: 'UX_CourseTeeTimeSlot_Set_Number', fields: ['teeTimeSetId', 'slotNumber'], unique: true },
    ],
});

module.exports = CourseTeeTimeSlot;
