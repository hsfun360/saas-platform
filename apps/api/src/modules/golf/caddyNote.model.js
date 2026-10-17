const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.CaddyNote (approved 2026-10-17; the spec's evaluation master, reward /
// penalty master and their records merged) - one entry on a caddy's record:
// a commendation, complaint, penalty or evaluation (caddy.constants
// NOTE_KINDS) with signed points for the grade review, the description and
// the follow-up.
const GolfCaddyNote = sequelize.define('GolfCaddyNote', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // golf.Caddy (intra-service FK, cascade).
    caddyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    noteDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // 'commendation' | 'complaint' | 'penalty' | 'evaluation'.
    kind: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // Signed; 0 allowed (a note with no score).
    points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    description: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    followUp: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'CaddyNote',
    timestamps: true,
    indexes: [
        { name: 'IX_GolfCaddyNote_Caddy_Date', fields: ['caddyId', 'noteDate'] },
    ],
});

module.exports = GolfCaddyNote;
