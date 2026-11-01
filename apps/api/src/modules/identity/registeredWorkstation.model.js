// src/modules/identity/registeredWorkstation.model.js
//
// One row per shared front-desk browser an administrator has registered for
// the organisation (structure approved 2026-11-01). Trust the PLACE, not the
// person: a "don't ask again on this device" row (TrustedDevice) belongs to one
// user, while a registered workstation belongs to the ACCOUNT, so any of its
// staff signing in from that browser skips the two-factor code. The raw token
// lives ONLY in the httpOnly 'ws' cookie; this row stores its SHA-256.
//
// What the station skips is the code CHALLENGE, never the password/SSO step
// and never enrolment: a staff member sent home still has an authenticator to
// sign in with. Administrator roles ignore it and confirm a code everywhere.
//
// Identity-service owned; accountId / registeredByUserId are plain value refs
// (no FK). Registration and revocation go through instance saves (audited);
// the per-login lastUsedAt stamp is a static update, which bypasses the audit
// hooks on purpose - one row per sign-in would be churn, not a trail.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

const RegisteredWorkstation = sequelize.define('RegisteredWorkstation', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // The organisation the station belongs to.
    accountId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // "Front Desk 1" - unique per account among live (unrevoked) rows.
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    // SHA-256 hex of the raw cookie value.
    tokenHash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
    },
    // The administrator who clicked Register on that browser.
    registeredByUserId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Issued + 365 days; re-register the station to renew.
    expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    revokedAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    // Last sign-in that skipped the code through this station.
    lastUsedAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    // For the device label on the Security Policy list.
    userAgent: {
        type: DataTypes.STRING(400),
        allowNull: true,
    },
    // IP at registration, shown on the list.
    ip: {
        type: DataTypes.STRING(64),
        allowNull: true,
    },
}, {
    tableName: 'RegisteredWorkstation',
    timestamps: true,
    indexes: [
        { fields: ['accountId'] },
        {
            name: 'UX_RegisteredWorkstation_account_name_live',
            unique: true,
            fields: ['accountId', 'name'],
            where: { revokedAt: null },
        },
    ],
});

module.exports = RegisteredWorkstation;
