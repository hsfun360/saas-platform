const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.BuggyIssue (approved 2026-10-17; spec 2.1.4 / 2.1.5 出库 / 入库 /
// 更换) - ONE OUTING of one unit: issued at the buggy station to the riders
// of a flight (golf.BuggyIssueRider), returned with a condition, or SWAPPED
// mid-round (the broken unit's issue ends 'swapped' and points at the
// replacement's issue, which points back). Issuing never bills anything -
// the buggy fee is a bill line charged at registration; the station only
// derives who is owed a buggy from those lines. At most ONE open ('out')
// issue per unit (partial unique index).
const GolfBuggyIssue = sequelize.define('GolfBuggyIssue', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // golf.Buggy (intra-service FK) + the asset tag snapshot.
    buggyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    buggyNo: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // The flight: play date, course, tee time and (for booked flights) the
    // booking - value refs, display and grouping only.
    playDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    courseId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    bookingProfileId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    teeTime: {
        type: DataTypes.TIME,
        allowNull: true,
    },
    issuedAt: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    issuedBy: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // 'good' | 'fault' (buggy.constants CONDITION_OUT_KEYS).
    conditionOut: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'good',
    },
    remarksOut: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    returnedAt: { type: DataTypes.DATE, allowNull: true },
    returnedBy: { type: DataTypes.UUID, allowNull: true },
    // 'good' | 'fault' | 'damaged' (CONDITION_IN_KEYS); NULL while out.
    conditionIn: {
        type: DataTypes.STRING(20),
        allowNull: true,
    },
    remarksIn: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // 'out' | 'returned' | 'swapped' (ISSUE_STATUS_KEYS).
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'out',
    },
    // Mid-round swap: why, at which hole, and the two-way link.
    swapReason: { type: DataTypes.STRING, allowNull: true },
    swapHole: { type: DataTypes.INTEGER, allowNull: true },
    replacedByIssueId: { type: DataTypes.UUID, allowNull: true },
    replacesIssueId: { type: DataTypes.UUID, allowNull: true },
    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'BuggyIssue',
    timestamps: true,
    indexes: [
        { name: 'IX_GolfBuggyIssue_Company_Date', fields: ['companyId', 'playDate'] },
        { name: 'IX_GolfBuggyIssue_Buggy_IssuedAt', fields: ['buggyId', 'issuedAt'] },
        // One open outing per unit.
        {
            name: 'UX_GolfBuggyIssue_Buggy_Out',
            fields: ['buggyId'],
            unique: true,
            where: { status: 'out' },
        },
    ],
});

module.exports = GolfBuggyIssue;
