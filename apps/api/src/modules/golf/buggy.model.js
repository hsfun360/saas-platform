const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.Buggy (approved 2026-10-17; spec 2.1.3 球车资料) - ONE physical unit
// of the club's fleet. `buggyNo` is the club's own asset tag (what the
// sticker reads, unique per company); `qrToken` is the opaque value the
// printed QR encodes so a scan resolves to the unit without typing.
// `status` is the register lifecycle (active | retired - retired units keep
// their history); `location` is SYSTEM-MAINTAINED by the station (issue ->
// on-course, return -> in-depot) and by maintenance (slice 2).
const GolfBuggy = sequelize.define('GolfBuggy', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The asset tag, e.g. 'B-012'. Uppercase, unique per company.
    buggyNo: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // golf.BuggyType (intra-service FK, restrict on delete).
    buggyTypeId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    model: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    serialNo: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    purchaseDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
    },
    // Opaque token printed in the QR label (32 hex chars); unique.
    qrToken: {
        type: DataTypes.STRING(64),
        allowNull: false,
    },
    // 'active' | 'retired' (buggy.constants BUGGY_STATUS_KEYS).
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'active',
    },
    retiredAt: { type: DataTypes.DATE, allowNull: true },
    retiredBy: { type: DataTypes.UUID, allowNull: true },
    retireReason: { type: DataTypes.STRING, allowNull: true },
    // 'in-depot' | 'on-course' | 'maintenance' (BUGGY_LOCATION_KEYS).
    location: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'in-depot',
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
    tableName: 'Buggy',
    timestamps: true,
    indexes: [
        { name: 'UX_GolfBuggy_Company_No', fields: ['companyId', 'buggyNo'], unique: true },
        { name: 'UX_GolfBuggy_QrToken', fields: ['qrToken'], unique: true },
        { name: 'IX_GolfBuggy_Company_Status_Location', fields: ['companyId', 'status', 'location'] },
    ],
});

module.exports = GolfBuggy;
