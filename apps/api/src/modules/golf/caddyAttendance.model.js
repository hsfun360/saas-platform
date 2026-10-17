const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.CaddyAttendance (approved 2026-10-17; the spec's roster generation
// replaced by a daily CHECK-IN, user decision) - one row per caddy per work
// date: checked in (present, waiting in the queue), out on the course, or
// checked out for the day. `queuedAt` is THE queue key - the check-in time,
// re-stamped when a round completes so the caddy goes to the back of the
// queue (FIFO, user decision). A caddy on leave, inactive or blacklisted
// cannot check in.
const GolfCaddyAttendance = sequelize.define('GolfCaddyAttendance', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // golf.Caddy (intra-service FK) + the badge snapshot.
    caddyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    caddyNo: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    workDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    checkedInAt: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    checkedInBy: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    checkedOutAt: { type: DataTypes.DATE, allowNull: true },
    checkedOutBy: { type: DataTypes.UUID, allowNull: true },
    // The queue key (earliest = next up).
    queuedAt: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    // 'present' | 'out' | 'off' (caddy.constants ATTENDANCE_STATUS_KEYS).
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'present',
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
    tableName: 'CaddyAttendance',
    timestamps: true,
    indexes: [
        { name: 'UX_GolfCaddyAttendance_Caddy_Date', fields: ['caddyId', 'workDate'], unique: true },
        { name: 'IX_GolfCaddyAttendance_Company_Date_Status', fields: ['companyId', 'workDate', 'status'] },
    ],
});

module.exports = GolfCaddyAttendance;
