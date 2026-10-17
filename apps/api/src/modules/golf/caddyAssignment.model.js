const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.CaddyAssignment (approved 2026-10-17) - ONE ROUND OF CADDY SERVICE:
// a caddy assigned at the station to the golfers of a caddy slot (the
// riders in golf.CaddyAssignmentPlayer), completed with the holes played, or
// SWAPPED mid-round (the first assignment ends 'swapped' and points at the
// replacement's, which points back). The club pays caddies outside the
// system (user decision), so this row is the record the club settles from:
// `countsAsRound` is set at completion (true) or at a swap from the reason
// (SWAP_REASONS.countsAsRound). Assigning never bills anything - the caddy
// fee is a bill line; the station derives the slots from those lines.
// At most ONE open ('assigned') assignment per caddy (partial unique).
const GolfCaddyAssignment = sequelize.define('GolfCaddyAssignment', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // golf.Caddy (intra-service FK) + the badge snapshot + the day's attendance row.
    caddyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    caddyNo: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    caddyAttendanceId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // The flight (value refs, display and grouping only).
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
    // 9 or 18 - the golfers' registered holes.
    holes: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 18,
    },
    assignedAt: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    assignedBy: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // The player asked for THIS caddy (out of the queue's turn; slice 3's
    // booking request pre-fills it).
    requestedByName: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // 'assigned' | 'completed' | 'swapped' (ASSIGNMENT_STATUS_KEYS).
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'assigned',
    },
    holesPlayed: { type: DataTypes.INTEGER, allowNull: true },
    completedAt: { type: DataTypes.DATE, allowNull: true },
    completedBy: { type: DataTypes.UUID, allowNull: true },
    completionNote: { type: DataTypes.STRING, allowNull: true },
    // Mid-round swap: the reason (SWAP_REASON_KEYS), the hole, the two-way link.
    swapReason: { type: DataTypes.STRING(20), allowNull: true },
    swapHole: { type: DataTypes.INTEGER, allowNull: true },
    countsAsRound: { type: DataTypes.BOOLEAN, allowNull: true },
    replacedByAssignmentId: { type: DataTypes.UUID, allowNull: true },
    replacesAssignmentId: { type: DataTypes.UUID, allowNull: true },
    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'CaddyAssignment',
    timestamps: true,
    indexes: [
        { name: 'IX_GolfCaddyAssignment_Company_Date', fields: ['companyId', 'playDate'] },
        { name: 'IX_GolfCaddyAssignment_Caddy_AssignedAt', fields: ['caddyId', 'assignedAt'] },
        // One open round per caddy.
        {
            name: 'UX_GolfCaddyAssignment_Caddy_Open',
            fields: ['caddyId'],
            unique: true,
            where: { status: 'assigned' },
        },
    ],
});

module.exports = GolfCaddyAssignment;
