const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.Caddy (approved 2026-10-17; spec 2.2.1 球僮资料) - the club's caddy
// register: one row per caddy with the badge number, grade and optional
// group, identity and contact details, photo, the QR token the badge
// carries, and the register status (active | inactive | blacklisted - a
// blacklisted row is kept so the badge number is never reissued). Caddies
// are NOT system users. `nationalityCode` / `raceCode` are subscriber
// reference codes (value refs, no FK); `companyId` is a Control-Plane
// reference, no FK.
const GolfCaddy = sequelize.define('GolfCaddy', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The badge number, e.g. 'C-012'. Uppercase, unique per company.
    caddyNo: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // golf.CaddyGrade (intra-service FK, restrict on delete).
    caddyGradeId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // golf.CaddyGroup (intra-service FK, set null on delete).
    caddyGroupId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    isLeader: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // The company-wide staff number, when the club has one.
    staffNo: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    identityNo: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    // 'male' | 'female' (caddy.constants GENDERS).
    gender: {
        type: DataTypes.STRING(10),
        allowNull: true,
    },
    dateOfBirth: {
        type: DataTypes.DATEONLY,
        allowNull: true,
    },
    mobile: {
        type: DataTypes.STRING(30),
        allowNull: true,
    },
    email: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },
    // Free text, e.g. 'Malay, English, Mandarin'.
    languages: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    nationalityCode: {
        type: DataTypes.STRING(20),
        allowNull: true,
    },
    raceCode: {
        type: DataTypes.STRING(20),
        allowNull: true,
    },
    // Public GCS URL of the caddy's photo.
    photo: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Opaque token printed in the badge QR (32 hex chars); unique.
    qrToken: {
        type: DataTypes.STRING(64),
        allowNull: false,
    },
    // 'active' | 'inactive' | 'blacklisted' (CADDY_STATUS_KEYS).
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'active',
    },
    statusReason: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    joinedDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
    },
    leftDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
    },
    remarks: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'Caddy',
    timestamps: true,
    indexes: [
        { name: 'UX_GolfCaddy_Company_No', fields: ['companyId', 'caddyNo'], unique: true },
        { name: 'UX_GolfCaddy_QrToken', fields: ['qrToken'], unique: true },
        { name: 'IX_GolfCaddy_Company_Status', fields: ['companyId', 'status'] },
    ],
});

module.exports = GolfCaddy;
