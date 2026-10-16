const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.PlayerType (spec 2.3.1; approved 2026-10-15) - the club's catalog of
// player categories. The `code` is THE key stored on every booking and
// registration line (Player.playerType, GroupPlayer.playerType), on the rate
// card default (TransactionType.golferType) and on the playing-right and
// round-quota rules; `baseIdentity` is the engine class the type behaves as
// (playerType.constants BASE_IDENTITIES). Three SYSTEM rows per company
// (member / member-guest / guest) are seeded lazily and their codes locked;
// the club adds affiliate-base types (and, later, guest sub-kinds such as a
// hotel guest). `companyId` is a Control-Plane reference, no FK.
const GolfPlayerType = sequelize.define('GolfPlayerType', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Uppercase for club-defined types (the three system codes stay lower
    // case for continuity); unique per company.
    code: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    description: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // 'member' | 'member-guest' | 'guest' | 'affiliate'.
    baseIdentity: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // Bookings carrying a player of this type need approval (the booking
    // approval lifecycle, Workflow purpose golf-booking).
    requiresApproval: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // Seeded built-ins: code locked, never deleted or disabled.
    isSystem: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100,
    },
    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'PlayerType',
    timestamps: true,
    indexes: [
        { name: 'UX_GolfPlayerType_Company_Code', fields: ['companyId', 'code'], unique: true },
    ],
});

module.exports = GolfPlayerType;
