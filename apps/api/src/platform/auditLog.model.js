// src/platform/auditLog.model.js
//
// Append-only audit trail (structure approved 2026-07-28, retention: keep
// everything). Rows are written ONLY by the global hooks in auditHooks.js -
// there is deliberately no update or delete API for this table.

const { DataTypes } = require('sequelize');
const { sequelize } = require('./db');
const { AUDIT_SCHEMA } = require('./schemas');

const AuditLog = sequelize.define('AuditLog', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    happenedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
    // create | update | delete
    action: {
        type: DataTypes.STRING(10),
        allowNull: false,
    },
    tableName: {
        type: DataTypes.STRING(80),
        allowNull: false,
    },
    // STRING so non-UUID primary keys (e.g. Country.alpha2) fit too.
    recordId: {
        type: DataTypes.STRING(64),
        allowNull: false,
    },
    // { field: { from, to } } - full values on create, prior values on delete.
    // Sensitive fields arrive already redacted (see auditHooks.js).
    changes: {
        type: DataTypes.JSONB,
        allowNull: false,
    },
    // Who - null = system boot / worker / unauthenticated caller.
    userId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // Denormalized so the trail stays readable after a user row is deleted.
    userEmail: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    ip: {
        type: DataTypes.STRING(64),
        allowNull: true,
    },
    // Groups every row changed by one HTTP request.
    requestId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
}, {
    schema: AUDIT_SCHEMA,
    tableName: 'AuditLog',
    timestamps: false, // happenedAt is the one timestamp that matters
    indexes: [
        { fields: ['tableName', 'recordId'] },
        { fields: ['userId'] },
        { fields: ['happenedAt'] },
    ],
});

module.exports = AuditLog;
