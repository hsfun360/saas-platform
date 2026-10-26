const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// facility.Venue (slice 5, structure approved 2026-10-26) - WHERE a class is
// held: a place of its own, not a facility. 'Pool lanes 1-2', the shallow
// corner, 'Studio A', a meeting room, or a whole court. A venue may link to
// ONE facility unit, and that link decides the blocking: a venue on a
// slot-type unit blocks the WHOLE unit's booking cells while a session runs
// (a court is whole); a venue on an entry-type unit blocks nothing (the
// session takes part of the pool); an unlinked venue blocks nothing and has
// no closures. Several venues may share one unit. Intra-service FK to the
// unit (RESTRICT); `companyId` is a Control-Plane reference, no FK.
const FacilityVenue = sequelize.define('FacilityVenue', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Short code, upper-cased, frozen once a session references the venue.
    code: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // 'Pool lanes 1-2', 'Studio A', 'Badminton Court 3'.
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // The facility unit the venue occupies; NULL = not a facility.
    facilityId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // Default seats (1 to 500); a class, a schedule or a session may lower it.
    capacity: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    // Where to find it ('Level 2, past the gym').
    location: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    remarks: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // An inactive venue keeps past sessions and cannot be picked for new ones.
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
    tableName: 'Venue',
    timestamps: true,
    indexes: [
        { name: 'UX_FacilityVenue_Company_Code', fields: ['companyId', 'code'], unique: true },
        { name: 'IX_FacilityVenue_Company_Active', fields: ['companyId', 'isActive'] },
        { name: 'IX_FacilityVenue_Facility', fields: ['facilityId'] },
    ],
});

module.exports = FacilityVenue;
