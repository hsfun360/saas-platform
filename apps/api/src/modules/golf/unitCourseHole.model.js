const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// Hole detail rows of a Unit Course (spec 2.2.2 Hole Setup). Hole numbers are
// fixed by the unit course's type (OUT -> 1-9, IN -> 10-18, COMPOSITE -> 1-18);
// the user maintains par, stroke index and remarks per hole.
//
// Both sides of the parent-child link are owned by the Golf service, so this is
// a real intra-service FK (holes cascade with their unit course) - see the
// association in wiring/associations.js.
const UnitCourseHole = sequelize.define('UnitCourseHole', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    unitCourseId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Hole number within the type's range (see unitCourse.constants).
    holeNumber: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    // Standard strokes for the hole (标准杆): 3, 4 or 5.
    par: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    // Handicap index / difficulty ranking (难度系数, HCP) used for handicap
    // stroke allocation, 1-18. Parity follows the numbering context so a paired
    // 18 gets a full 1-18 set: front-nine holes (1-9) take ODD indexes,
    // back-nine holes (10-18) take EVEN ones.
    handicapIndex: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    remarks: {
        type: DataTypes.STRING,
        allowNull: true,
    },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'UnitCourseHole',
    timestamps: true,
    indexes: [
        { name: 'UX_UnitCourseHole_Course_Number', fields: ['unitCourseId', 'holeNumber'], unique: true },
    ],
});

module.exports = UnitCourseHole;
