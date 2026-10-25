const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// Facility Session (structure approved 2026-10-25; shape of golf.GolfSession)
// - the club's named day parts (Morning / Afternoon / Evening / Peak), each a
// time band (end exclusive). They are the peak / off-peak axis of the slice-2
// rate card and the unit of the per-session booking limit. Maintained on
// Facility Specification, PUT-replaced; bands must not overlap. A slot whose
// start no band covers is simply outside the session system.
const FacilitySession = sequelize.define('FacilitySession', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    name: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    startTime: {
        type: DataTypes.TIME,
        allowNull: false,
    },
    // End exclusive: 17:00-22:00 owns slots starting 17:00..21:59.
    endTime: {
        type: DataTypes.TIME,
        allowNull: false,
    },
    // Display order on the editor (morning first).
    sequence: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
    },
    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: FACILITY_SCHEMA,
    tableName: 'FacilitySession',
    timestamps: true,
    indexes: [
        { name: 'UX_FacilitySession_Company_Name', fields: ['companyId', 'name'], unique: true },
    ],
});

module.exports = FacilitySession;
