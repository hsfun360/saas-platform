const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// Guest-control exception rule (user decisions 2026-09-20; reshaped
// 2026-11-13). The GENERAL allow flags live on GolfSetting (allowGuest /
// allowVisitor per weekday/weekend) behind the guestControlEnabled master
// switch; these sparse rows exist only where a club wants a different answer
// for a course, a day type, or a flight-time band (e.g. weekend before noon:
// members only - no guests, no visitors). TWO switches per scope, matching
// the club's patron groups: allowGuest = a member's guests (guest-base lines
// and members playing as another member's guest), allowVisitor = the public
// with no host (desk walk-ins). Affiliated and reciprocal club members are
// exempt. Resolution at booking time picks the MOST SPECIFIC matching rule
// (specific course > every course, time band > whole day, exact dayScope >
// 'all'); no match falls back to the GolfSetting flags. Rules are stored even
// while the master switch is OFF but only take EFFECT while it is ON.
// Enforced at booking and at the desk. Rows are PUT-replaced atomically from
// Golf Specification. (allowMemberGuest dropped 2026-11-13 - see app.js.)
const GuestControlRule = sequelize.define('GuestControlRule', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // A specific 18-hole course; NULL = every course. Plain UUID value ref.
    courseId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // all | weekday | weekend | a specific day-of-week ('monday'..'sunday',
    // added 2026-09-28 - e.g. a Sunday guest ban). Public holidays count as
    // weekend (platform/calendarGateway.js); a specific day outranks the
    // weekday/weekend scopes at resolution.
    dayScope: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'all',
    },
    // Optional time band, both-or-neither (closure-plan convention); both
    // NULL = whole day. A booking's tee time falls in [startTime, endTime).
    startTime: {
        type: DataTypes.TIME,
        allowNull: true,
    },
    endTime: {
        type: DataTypes.TIME,
        allowNull: true,
    },
    // A member's guests allowed in this scope.
    allowGuest: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // Visitors (no host) allowed in this scope.
    allowVisitor: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'GuestControlRule',
    timestamps: true,
    indexes: [
        { name: 'IX_GuestControlRule_Company', fields: ['companyId'] },
    ],
});

module.exports = GuestControlRule;
