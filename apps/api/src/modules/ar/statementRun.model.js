const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { AR_SCHEMA } = require('../../platform/schemas');

// StatementRun - a tracked statement-generation job (approved 2026-08-06;
// background execution 2026-08-08). A club can need thousands of statements
// per month, so after submit the OUTBOX WORKER drives the run in time-boxed
// slices (the run row IS the task queue: status 'queued' marks pending work),
// each debtor committing in its own transaction - progress is a true
// percentage, any interruption resumes exactly where it stopped, and the
// user's session is never held. The screen only POLLS this row.
//
// leaseUntil is the worker's claim: a slice claims the run only when the lease
// is free/expired, renews it every chunk, and releases it on voluntary yield -
// so overlapping drain invocations (ping + sweep) never double-process, and a
// crashed instance's lease simply expires.
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
    // 'queued' | 'running' | 'cancelling' | 'completed' | 'cancelled' | 'failed'.
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'queued',
    },
    // Worker claim lease (see header note).
    leaseUntil: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    // Observability heartbeat: when a worker last advanced this run.
    lastProcessedAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    // Exactly-once guard for the completion notification + email.
    notifiedAt: {
        type: DataTypes.DATE,
        allowNull: true,
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
