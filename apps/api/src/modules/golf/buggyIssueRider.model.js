const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.BuggyIssueRider (approved 2026-10-17) - one RIDER of one outing: the
// registered player's starting-nine Player record and golfer (value refs)
// with display snapshots, and the buggy-fee bill line whose seat this rider
// takes (`billItemId`, value ref). The station derives a flight's buggy
// demand from fee lines that no rider row of a live issue references, so a
// line is consumed once. NULL billItemId = issued without a fee line
// (allowed only on a non-compulsory course, with a warning).
const GolfBuggyIssueRider = sequelize.define('GolfBuggyIssueRider', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // golf.BuggyIssue (intra-service FK, cascade).
    buggyIssueId: {
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
        allowNull: true,
    },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'BuggyIssueRider',
    timestamps: true,
    indexes: [
        { name: 'UX_GolfBuggyIssueRider_Issue_Player', fields: ['buggyIssueId', 'playerId'], unique: true },
        { name: 'IX_GolfBuggyIssueRider_Player', fields: ['playerId'] },
        { name: 'IX_GolfBuggyIssueRider_BillItem', fields: ['billItemId'] },
    ],
});

module.exports = GolfBuggyIssueRider;
