const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// facility.GuestControlRule (structure approved 2026-10-25; golf's shape with
// the facility type in place of the course). The GENERAL flags live on
// FacilitySetting and the per-type policy on FacilityType; these sparse rows
// exist only where a type, day type or time band needs a different answer
// (no visitor guests on badminton at weekends before noon). Resolution picks
// the MOST SPECIFIC matching rule (specific type > every type; a specific
// weekday > weekday/weekend > all; time band > whole day); no match falls
// back to the Facility Type policy, then the Specification flags. Rows are
// stored while the master switch is OFF and take effect while it is ON.
// PUT-replaced from Facility Specification.
const GuestControlRule = sequelize.define('FacilityGuestControlRule', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // A specific Facility Type; NULL = every type. Value ref.
    facilityTypeId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // facility.constants RULE_DAY_SCOPE_KEYS.
    dayScope: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'all',
    },
    // Optional band, both or neither; a slot's START falls in [start, end).
    startTime: {
        type: DataTypes.TIME,
        allowNull: true,
    },
    endTime: {
        type: DataTypes.TIME,
        allowNull: true,
    },
    allowGuest: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    allowMemberGuest: {
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
    tableName: 'GuestControlRule',
    timestamps: true,
    indexes: [
        { name: 'IX_FacilityGuestControlRule_Company', fields: ['companyId'] },
    ],
});

module.exports = GuestControlRule;
