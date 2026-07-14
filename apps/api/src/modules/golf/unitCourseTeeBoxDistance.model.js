const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// Per-hole playing distance from a tee box (the yardage rows of a scorecard:
// each colour has its own distance to every hole of the nine). The OUT/IN
// totals a scorecard shows are computed sums, never stored.
//
// Intra-service parent-child: distances cascade with their tee box - see
// wiring/associations.js.
const UnitCourseTeeBoxDistance = sequelize.define('UnitCourseTeeBoxDistance', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    teeBoxId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Hole number within the unit course's range (fixed by the course type).
    holeNumber: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    // Distance from this tee to the hole. Unit-agnostic integer (the club
    // decides metres vs yards), like the source system.
    distance: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'UnitCourseTeeBoxDistance',
    timestamps: true,
    indexes: [
        { name: 'UX_UnitCourseTeeBoxDistance_Tee_Hole', fields: ['teeBoxId', 'holeNumber'], unique: true },
    ],
});

module.exports = UnitCourseTeeBoxDistance;
