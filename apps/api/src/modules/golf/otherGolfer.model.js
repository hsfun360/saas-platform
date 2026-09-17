const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// OtherGolfer - the golf-owned profile master for PUBLIC / walk-in players,
// mirroring ar.OtherDebtor (user decisions 2026-09-17). Golf serves the
// general public as well as members (some clubs open to the public on
// weekdays); these people are golf's customers, NOT club members - they must
// never be stored in the membership service. Column vocabulary follows the
// platform person standard (membership Member: identityNo, nationalityCode,
// birthDate, mobile, email).
//
// A row is created at booking/registration, AFTER a dedupe lookup by
// identityNo / mobile, so a returning visitor keeps one profile - and with it
// the durable identity that rain checks (a liability owed to a person) and
// no-show history require. Referenced from golf.Golfer (golferType 'other',
// sourceId = this id); consumers never reference OtherGolfer directly.
const OtherGolfer = sequelize.define('OtherGolfer', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Full display name as entered at the front desk (deliberately not split
    // into first/middle/last - counter entry speed).
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // IC / passport number - the dedupe key (indexed, NOT unique: typo
    // tolerance; dedupe is a find-first lookup, not a constraint).
    identityNo: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    gender: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Enables junior/senior rates later.
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
    schema: GOLF_SCHEMA,
    tableName: 'OtherGolfer',
    timestamps: true,
    indexes: [
        { name: 'IDX_OtherGolfer_Company_Identity', fields: ['companyId', 'identityNo'] },
        { name: 'IDX_OtherGolfer_Company_Mobile', fields: ['companyId', 'mobile'] },
        { name: 'IDX_OtherGolfer_Company_Name', fields: ['companyId', 'name'] },
    ],
});

module.exports = OtherGolfer;
