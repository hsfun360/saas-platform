const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// facility.Instructor (slice 5, structure approved 2026-10-26) - a person who
// leads class sessions. No login of their own in this slice (an instructor
// portal would link a userId later, as the Sales Agent module did). The
// `code` is frozen once a session references the instructor; an inactive
// instructor keeps past sessions and cannot be picked for new ones.
const FacilityInstructor = sequelize.define('FacilityInstructor', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    code: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    mobile: {
        type: DataTypes.STRING(30),
        allowNull: true,
    },
    // Receives the session cancellation and the daily roster emails when set.
    email: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Free text ('Yoga, Pilates').
    specialities: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Public GCS URL, uploaded like a Facility Type icon.
    photoUrl: {
        type: DataTypes.STRING(1000),
        allowNull: true,
    },
    remarks: {
        type: DataTypes.STRING,
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
    tableName: 'Instructor',
    timestamps: true,
    indexes: [
        { name: 'UX_FacilityInstructor_Company_Code', fields: ['companyId', 'code'], unique: true },
        { name: 'IX_FacilityInstructor_Company_Active', fields: ['companyId', 'isActive'] },
    ],
});

module.exports = FacilityInstructor;
