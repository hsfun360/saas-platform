const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.BuggyDamage (approved 2026-10-18; spec 球车赔偿登记 with compensation
// left OUT of the system by user decision) - ONE DAMAGE INCIDENT on one
// unit: the outing it happened on, the rider held responsible (snapshots),
// the reason type (player / staff / not caused by a person) and the
// description. A damaged return at the station records it together with
// the repair it opens (`maintenanceId`); the record resolves when that
// repair completes. No amount, no charge: the club settles any
// compensation outside the system.
const GolfBuggyDamage = sequelize.define('GolfBuggyDamage', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // golf.Buggy (intra-service FK, restrict) + the asset tag snapshot.
    buggyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    buggyNo: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // The outing (id ref) and the date it happened.
    buggyIssueId: { type: DataTypes.UUID, allowNull: true },
    playDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // The rider held responsible (value refs + snapshots), when known.
    golferId: { type: DataTypes.UUID, allowNull: true },
    playerId: { type: DataTypes.UUID, allowNull: true },
    golferName: { type: DataTypes.STRING, allowNull: true },
    memberNo: { type: DataTypes.STRING(50), allowNull: true },
    // 'player' | 'staff' | 'non-human' (DAMAGE_REASON_TYPE_KEYS).
    reasonType: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'player',
    },
    description: { type: DataTypes.STRING(1000), allowNull: false },
    // The repair opened for it (id ref) and when that repair completed.
    maintenanceId: { type: DataTypes.UUID, allowNull: true },
    resolvedAt: { type: DataTypes.DATE, allowNull: true },
    remarks: { type: DataTypes.STRING, allowNull: true },
    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'BuggyDamage',
    timestamps: true,
    indexes: [
        { name: 'IX_GolfBuggyDamage_Company_Date', fields: ['companyId', 'playDate'] },
        { name: 'IX_GolfBuggyDamage_Buggy', fields: ['buggyId'] },
    ],
});

module.exports = GolfBuggyDamage;
