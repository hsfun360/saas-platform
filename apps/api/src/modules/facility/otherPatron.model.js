const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// facility.OtherPatron (structure approved 2026-10-25) - the facility-owned
// profile master for VISITORS, mirroring golf.OtherGolfer: these people are
// the club's customers, not members, and are never stored in the membership
// service. Column vocabulary follows the platform person standard. Created
// at booking/registration AFTER a dedupe lookup by identityNo / mobile, so a
// returning visitor keeps one profile. Referenced from facility.Patron
// (patronType 'other', sourceId = this id); consumers never reference it
// directly. Visitor profiles stay per module for now (user decision
// 2026-10-24; a platform visitor master may come later with a re-point).
const OtherPatron = sequelize.define('FacilityOtherPatron', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Full display name as keyed at the desk.
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // IC / passport number - the dedupe key (indexed, NOT unique).
    identityNo: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    gender: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    birthDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
    },
    nationalityCode: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // One combined string (dialling code + number, app-phone-input standard).
    mobile: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    email: {
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
    tableName: 'OtherPatron',
    timestamps: true,
    indexes: [
        { name: 'IX_FacilityOtherPatron_Company_Identity', fields: ['companyId', 'identityNo'] },
        { name: 'IX_FacilityOtherPatron_Company_Mobile', fields: ['companyId', 'mobile'] },
        { name: 'IX_FacilityOtherPatron_Company_Name', fields: ['companyId', 'name'] },
    ],
});

module.exports = OtherPatron;
