const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// facility.Facility (structure approved 2026-10-25) - ONE physical unit of a
// Facility Type: Badminton Court 1, Tennis Court 10, the Gym, Locker 001. A
// counted consumable type (towels) has one row ("Towel counter"). The slot
// definition lives on the TYPE so ten courts share it; closures key on the
// type with an optional single unit. Slice 3 adds `unitStatus` and
// `currentIssueId` for issue-mode units. `companyId` is denormalised for
// listing and the per-company code uniqueness (the type carries it too).
// Intra-service FK to the type (RESTRICT while units exist).
const Facility = sequelize.define('Facility', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    facilityTypeId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // 'BC1', 'TC10', 'L001' - unique per company.
    code: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // 'Badminton Court 1', 'Locker 001'.
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // 'Sports Hall, Level 2'.
    location: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Booking grid filters.
    isIndoor: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    isFloodlit: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // Entry mode only: this unit's own cap (a second pool); NULL = counted
    // under the type's capacity.
    capacity: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    // Public GCS URL, same upload flow as the golf course photo.
    pictureUrl: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    remarks: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100,
    },
    // Inactive = not bookable, not issuable; existing bookings stand.
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
    tableName: 'Facility',
    timestamps: true,
    indexes: [
        { name: 'UX_Facility_Company_Code', fields: ['companyId', 'code'], unique: true },
        { name: 'IX_Facility_Type_Sort', fields: ['facilityTypeId', 'sortOrder'] },
    ],
});

module.exports = Facility;
