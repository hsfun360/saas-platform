const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.CaddyLeave (approved 2026-10-17; spec 2.2.1 请假 + 工伤) - a caddy's
// absence over a date range (leaveType from caddy.constants LEAVE_TYPES).
// Ranges of one caddy never overlap (checked in the controller). A caddy on
// leave is not rostered or assigned for those dates (slice 2).
const GolfCaddyLeave = sequelize.define('GolfCaddyLeave', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // golf.Caddy (intra-service FK, cascade).
    caddyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // 'annual' | 'sick' | 'injury' | 'unpaid' | 'other'.
    leaveType: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    dateFrom: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    dateTo: {
        type: DataTypes.DATEONLY,
        allowNull: false,
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
    tableName: 'CaddyLeave',
    timestamps: true,
    indexes: [
        { name: 'IX_GolfCaddyLeave_Caddy_From', fields: ['caddyId', 'dateFrom'] },
        { name: 'IX_GolfCaddyLeave_Company_Dates', fields: ['companyId', 'dateFrom', 'dateTo'] },
    ],
});

module.exports = GolfCaddyLeave;
