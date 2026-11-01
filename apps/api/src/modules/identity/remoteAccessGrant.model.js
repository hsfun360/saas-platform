// src/modules/identity/remoteAccessGrant.model.js
//
// A time-boxed exception to the registered-workstation lock (structure
// approved 2026-11-01): "Alice may sign in from outside the premises until
// Friday 6 pm". One row per request or grant. A grant lifts the LOCATION lock
// only - the password and the two-factor code are still required from home -
// so an attacker holding a password cannot get in by asking nicely.
//
// Lifecycle (status):
//   pending  - asked for from the sign-in screen, waiting for an approver
//   approved - decided; live between validFrom and validUntil
//   rejected - decided against
//   revoked  - an approved grant cut short (revokedAt)
//   expired  - an approved grant past validUntil; derived at read time and
//              stamped only when the Access Requests screen sweeps, so the
//              list stays truthful without a timer
//
// Identity-service owned; accountId / userId / decidedByUserId are plain
// value refs (no FK). Rows go through instance saves, so the audit trail
// records every request, decision and revocation.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

const RemoteAccessGrant = sequelize.define('RemoteAccessGrant', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    accountId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The staff member the grant is for.
    userId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    status: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'pending',
        validate: { isIn: [['pending', 'approved', 'rejected', 'revoked', 'expired']] },
    },
    // Typed by the requester at the sign-in screen, or by the administrator.
    reason: {
        type: DataTypes.STRING(500),
        allowNull: true,
    },
    requestedAt: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    // The device the request came from, shown to the approver so they can
    // phone the person if anything looks off.
    requestUserAgent: {
        type: DataTypes.STRING(400),
        allowNull: true,
    },
    requestIp: {
        type: DataTypes.STRING(64),
        allowNull: true,
    },
    // Set on approval; validUntil is bounded by Account.remoteAccessGrantMaxDays.
    validFrom: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    validUntil: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    decidedByUserId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    decidedAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    // Optional note back to the requester.
    decisionNote: {
        type: DataTypes.STRING(500),
        allowNull: true,
    },
    revokedAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
}, {
    tableName: 'RemoteAccessGrant',
    timestamps: true,
    indexes: [
        { fields: ['userId', 'status'] },
        { fields: ['accountId', 'status'] },
    ],
});

module.exports = RemoteAccessGrant;
