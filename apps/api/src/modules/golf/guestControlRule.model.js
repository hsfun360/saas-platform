const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// Guest-control exception rule (user decisions 2026-09-20). The GENERAL
// allow flags live on GolfSetting (allowGuest/allowMemberGuest per weekday/
// weekend) behind the guestControlEnabled master switch; these sparse rows
// exist only where a club wants a different answer for a course, a day type,
// or a flight-time band (e.g. weekend before noon: members and member-guests
// only, no visitors). TWO switches per scope, matching the pricing matrix's
// member vs guest split: allowGuest = visitor guests, allowMemberGuest = a
// member playing under another member's booking. Resolution at booking time
// picks the MOST SPECIFIC matching rule (specific course > every course,
// time band > whole day, exact dayScope > 'all'); no match falls back to the
// GolfSetting flags. Rules are stored even while the master switch is OFF
// but only take EFFECT while it is ON. Enforced at booking and re-checked at
// registration. Rows are PUT-replaced atomically from Golf Specification.
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
    // all | weekday | weekend - the shared day vocabulary (public holidays
    // count as weekend, classified via platform/calendarGateway.js).
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
    // Visitor guests allowed in this scope.
    allowGuest: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // Members-as-guests allowed in this scope.
    allowMemberGuest: {
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
