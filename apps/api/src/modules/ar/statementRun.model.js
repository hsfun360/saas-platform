const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { AR_SCHEMA } = require('../../platform/schemas');

// StatementRun - a tracked statement-generation job (approved 2026-08-06).
// A club can need thousands of statements per month; Cloud Run throttles CPU
// outside requests, so one long request would stall or time out. Instead the
// run freezes its debtor list up front and the screen drives processing in
// small chunks (POST /:id/process), each chunk committing per debtor - which
// makes progress a true percentage and any interruption resumable exactly
// where it stopped.
const StatementRun = sequelize.define('StatementRun', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Frozen run parameters (see Statement for the month-vs-range semantics).
    statementMonth: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    periodStart: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    periodEnd: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // The debtor categories selected: ['individual','corporate','nominee','other'].
    scope: {
        type: DataTypes.JSONB,
        allowNull: false,
    },
    // The debtor id list frozen at start, processed in order.
    debtorIds: {
        type: DataTypes.JSONB,
        allowNull: false,
    },
    // 'running' | 'completed' | 'cancelled' | 'failed'.
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'running',
    },
    totalDebtors: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    processedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    // generated = statements actually written (debtors with no balance and no
    // activity are processed but produce nothing); replaced = how many of those
    // overwrote an existing statement for the month.
    generatedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    replacedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    errorMessage: { type: DataTypes.STRING, allowNull: true },
    // Ownership stamps.
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: AR_SCHEMA,
    tableName: 'StatementRun',
    timestamps: true,
    indexes: [
        { name: 'IDX_StatementRun_Company_Created', fields: ['companyId', 'createdAt'] },
    ],
});

module.exports = StatementRun;
