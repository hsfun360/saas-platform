const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// facility.AdvanceBookingOverride (structure approved 2026-10-25) - a
// membership type's privilege to book EARLIER than the general window,
// behind FacilitySetting.allowMembershipTypeOverride. Window resolution for
// a booking: this override (switch ON + row) > the Facility Type's
// advanceBookingDays > the Specification's general days; the early-opening
// hours are always the Specification's. `membershipTypeId` is a gateway-
// validated value ref. PUT-replaced from Facility Specification.
const AdvanceBookingOverride = sequelize.define('FacilityAdvanceBookingOverride', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    membershipTypeId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    advanceBookingDays: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: FACILITY_SCHEMA,
    tableName: 'AdvanceBookingOverride',
    timestamps: true,
    indexes: [
        { name: 'UX_FacilityAdvanceBookingOverride_Company_Type', fields: ['companyId', 'membershipTypeId'], unique: true },
    ],
});

module.exports = AdvanceBookingOverride;
