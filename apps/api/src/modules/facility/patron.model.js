const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// facility.Patron (structure approved 2026-10-25) - the THIN person identity
// of Facility Management, mirroring golf.Golfer / ar.Debtor: one row per
// person who books, participates, registers or is issued an item; every
// downstream row references patronId - ONE reference shape, no
// member/visitor branching.
//
// The PROFILE lives at the source, never here (golden rule: one owner):
//   patronType 'member' -> sourceId = membership Member.id (plain UUID value
//     ref, no FK); standing, charge target and the monthly guest allowance
//     are asked LIVE through platform/membershipGateway.js.
//   patronType 'other'  -> sourceId = facility.OtherPatron.id (facility's own
//     visitor profile).
// `name` / `memberNo` are search-and-sort SNAPSHOTS refreshed from the source.
// Rows are created LAZILY at first booking or registration; a visitor who
// joins the club is RE-POINTED ('other' -> 'member') keeping the same id.
const Patron = sequelize.define('FacilityPatron', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // 'member' | 'other' (facility.constants PATRON_TYPES).
    patronType: {
        type: DataTypes.STRING(10),
        allowNull: false,
    },
    // Polymorphic profile reference (see header); no DB-level FK.
    sourceId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    memberNo: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    // Desk notes (bans, VIP flags).
    remarks: {
        type: DataTypes.TEXT,
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
    tableName: 'Patron',
    timestamps: true,
    indexes: [
        { name: 'UX_FacilityPatron_Company_Type_Source', fields: ['companyId', 'patronType', 'sourceId'], unique: true },
        { name: 'IX_FacilityPatron_Company_Name', fields: ['companyId', 'name'] },
    ],
});

module.exports = Patron;
