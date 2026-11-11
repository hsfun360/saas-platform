const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// facility.UtilityUnit (slice 6a, structure approved 2026-11-11) - one
// numbered unit of a utility item that tracks its units: locker L014.
// `unitStatus` follows the issue (issued), the return (available, or
// out-of-service after a damaged or lost return until the desk clears it).
// `companyId` is denormalised for scoping, as on every facility table.
const UtilityUnit = sequelize.define('FacilityUtilityUnit', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    utilityItemId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The number on the unit, e.g. L014.
    code: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // Where it is, e.g. "Men's changing room, row B".
    location: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // 'available' | 'issued' | 'out-of-service'.
    unitStatus: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'available',
    },
    // The live IssueRecord while 'issued' (plain value, no FK).
    currentIssueId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    remarks: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100,
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
    tableName: 'UtilityUnit',
    timestamps: true,
    indexes: [
        { name: 'UX_FacilityUtilityUnit_Company_Item_Code', fields: ['companyId', 'utilityItemId', 'code'], unique: true },
        { name: 'IX_FacilityUtilityUnit_Item_Status', fields: ['utilityItemId', 'unitStatus'] },
    ],
});

module.exports = UtilityUnit;
