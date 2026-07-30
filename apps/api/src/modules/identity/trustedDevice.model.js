// src/modules/identity/trustedDevice.model.js
//
// One row per browser that has proven MFA and asked not to be challenged again
// (structure approved 2026-07-30). The raw token lives ONLY in the httpOnly
// 'td' cookie; this row stores its SHA-256. A valid row lets completeLogin skip
// the TOTP step for THIS user on THIS browser - the password is still required,
// so a stolen cookie alone grants nothing. Trust is never extended by use and
// is revoked server-side when MFA is disabled/reset or the password changes.
//
// Identity-service owned; userId is a plain value ref (no FK).

const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

const TrustedDevice = sequelize.define('TrustedDevice', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    userId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // SHA-256 hex of the raw cookie value.
    tokenHash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
    },
    // Issued + 30 days; use never extends it (same philosophy as sessions).
    expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    revokedAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    // Last login that skipped the MFA challenge via this device.
    lastUsedAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    // For a future "trusted devices" management card.
    userAgent: {
        type: DataTypes.STRING(400),
        allowNull: true,
    },
    ip: {
        type: DataTypes.STRING(64),
        allowNull: true,
    },
}, {
    tableName: 'TrustedDevice',
    timestamps: true,
    indexes: [
        { fields: ['userId'] },
    ],
});

module.exports = TrustedDevice;
