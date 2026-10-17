const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.CaddyAssignmentPlayer (approved 2026-10-17) - one golfer of one round
// of caddy service: the registered player's starting-nine Player record and
// golfer (value refs) with display snapshots, and the caddy-fee bill line
// whose seat this golfer takes (`billItemId`). A caddy is never assigned
// without a caddy-fee line (user decision: a complimentary caddy carries a
// zero-priced caddy-fee item), so the column is always set; a consumed line
// is never assigned twice (a swap carries the lines to the replacement).
const GolfCaddyAssignmentPlayer = sequelize.define('GolfCaddyAssignmentPlayer', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // golf.CaddyAssignment (intra-service FK, cascade).
    caddyAssignmentId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    playerId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    golferId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    playerName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    memberNo: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    billItemId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'CaddyAssignmentPlayer',
    timestamps: true,
    indexes: [
        { name: 'UX_GolfCaddyAssignmentPlayer_Assignment_Player', fields: ['caddyAssignmentId', 'playerId'], unique: true },
        { name: 'IX_GolfCaddyAssignmentPlayer_Player', fields: ['playerId'] },
        { name: 'IX_GolfCaddyAssignmentPlayer_BillItem', fields: ['billItemId'] },
    ],
});

module.exports = GolfCaddyAssignmentPlayer;
