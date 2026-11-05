// src/modules/identity/refreshToken.model.js
//
// Server-side session record backing the httpOnly refresh-token cookie
// (structure approved 2026-07-27). The raw token lives ONLY in the cookie;
// this row stores its SHA-256. Rotation: each successful refresh marks the row
// rotatedAt and issues a sibling in the same familyId - replaying a
// rotated-out token is a theft signal that revokes the whole family.
//
// Identity-service owned; userId/companyId are plain value refs (no FK).

const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

const RefreshToken = sequelize.define('RefreshToken', {
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
    // Rotation family: one login = one family; refresh rotates within it.
    familyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The workspace this session is scoped to (null = System Administration),
    // so a refreshed access token re-enters the SAME workspace. (Necessary
    // addition to the approved structure.)
    companyId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // 30 days for "Keep me signed in", 24h otherwise.
    expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    rotatedAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    revokedAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    // Set when this session was ENDED BY A NEWER SIGN-IN under the account's
    // concurrent-session limit (2026-11-05): the familyId of that sign-in.
    // Distinguishes "signed in elsewhere" from sign-out and expiry - the
    // ended browser is told why, and the Profile list shows it.
    supersededByFamilyId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // When the session was last used to mint an access token (set at issue
    // and at every rotation - never per request). Shows "last active" on the
    // Profile's active-sessions list and picks the idlest session to end
    // when a limit above one is exceeded.
    lastSeenAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    // Shown on the Profile's active-sessions list (2026-11-05).
    userAgent: {
        type: DataTypes.STRING(400),
        allowNull: true,
    },
    ip: {
        type: DataTypes.STRING(64),
        allowNull: true,
    },
}, {
    tableName: 'RefreshToken',
    timestamps: true,
    indexes: [
        { fields: ['userId'] },
        { fields: ['familyId'] },
        // The live sessions of a user (the session-limit count at sign-in and
        // the Profile list): a partial index so the count stays an index read
        // however many ended rows accumulate.
        { name: 'IX_RefreshToken_user_live', fields: ['userId'], where: { revokedAt: null } },
    ],
});

module.exports = RefreshToken;
