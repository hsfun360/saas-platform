const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// Tee Box master rows of a Unit Course (spec 2.2.3 Tee Box Setup, 主表). Each
// nine defines its tee boxes by colour (e.g. BLUE / WHITE / RED). Per-hole
// distances live in UnitCourseTeeBoxDistance (totals are computed, never
// stored), measured in this row's measurementUnit. Difficulty ratings
// (course/slope) are NOT kept here - they belong to the rated 18-hole
// composition (Course Setup, spec 2.2.4).
//
// Intra-service parent-child: tee boxes cascade with their unit course - see
// wiring/associations.js.
const UnitCourseTeeBox = sequelize.define('UnitCourseTeeBox', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    unitCourseId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Colour code identifying the tee (颜色代码), unique per unit course. Stored
    // uppercase, e.g. 'BLUE', 'GOLD'.
    colorCode: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // Display/sort order (编号), 1-5.
    seq: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    // Actual display colour as a hex string (e.g. '#1e40af'), picked by the
    // user for future UI rendering (scorecards, tee sheets). The colour CODE
    // above stays the business identifier.
    colorHex: {
        type: DataTypes.STRING(9),
        allowNull: true,
    },
    // Free-text summary (摘要).
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Unit the per-hole distances are keyed in - one of unitCourse.constants
    // MEASUREMENT_UNIT_KEYS: 'meter' | 'yard'.
    measurementUnit: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'meter',
    },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'UnitCourseTeeBox',
    timestamps: true,
    indexes: [
        { name: 'UX_UnitCourseTeeBox_Course_Color', fields: ['unitCourseId', 'colorCode'], unique: true },
    ],
});

module.exports = UnitCourseTeeBox;
