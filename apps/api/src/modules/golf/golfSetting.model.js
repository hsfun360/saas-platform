const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// Golf Specification - the per-company golf settings SINGLETON (pattern of
// membership.MembershipSetting / ar.Setting; user decisions 2026-09-17).
// Future golf-wide settings extend this table. Maintained at /golf/settings.
//
// BOOKING WINDOW RULE (binding for the booking stage): the window for play
// date D opens at 00:00 of (D - effectiveDays) MINUS advanceBookingHours,
// computed in the club's local time - so with 7 days / 2 hours, at 22:00
// members can already book the play date that would otherwise open at the
// coming midnight. `effectiveDays` = the member's membership-type override
// (flag ON + AdvanceBookingOverride row exists) else advanceBookingDays;
// public golfers always use the general days; the hours are always general.
const GolfSetting = sequelize.define('GolfSetting', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // One row per company.
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // General advance-booking window in days (everyone: members and public).
    advanceBookingDays: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 7,
    },
    // Early-opening hours BEFORE midnight (0-23), club-wide, not overridable.
    advanceBookingHours: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    // When ON, AdvanceBookingOverride rows replace the general days for their
    // membership types (privileged earlier booking).
    allowMembershipTypeOverride: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'GolfSetting',
    timestamps: true,
    indexes: [
        { name: 'UX_GolfSetting_Company', fields: ['companyId'], unique: true },
    ],
});

module.exports = GolfSetting;
