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
    // Minimum players per booking (spec 2.2.12; user decisions 2026-09-19) -
    // the GENERAL rule per day type; 1 = no restriction. Per-course/time
    // exceptions live in golf.MinPlayerRule (most specific rule wins).
    // ENFORCEMENT: own player count meets the minimum OR joining brings the
    // flight's total to the minimum.
    minPlayersWeekday: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
    },
    // Weekend + public holiday (classified via platform/calendarGateway.js).
    minPlayersWeekend: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
    },
    // Guest control (user decisions 2026-09-20) - the master switch. OFF =
    // no restriction anywhere (the allow flags below and the GuestControlRule
    // rows are ignored). TWO switches per scope: visitor guests vs a member
    // playing under another member's booking. Per-course/time exceptions live
    // in golf.GuestControlRule (most specific rule wins). Enforced at booking
    // and re-checked at registration.
    guestControlEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    allowGuestWeekday: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    allowMemberGuestWeekday: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // Weekend + public holiday (classified via platform/calendarGateway.js).
    allowGuestWeekend: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    allowMemberGuestWeekend: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // Merge booking (club-wide, user decision 2026-09-19). OFF = exclusive
    // flights: the first confirmed booking claims the whole flight, extra
    // players join only that same booking. ON = shared flights: bookings
    // attach to a flight until the slot's max players is reached. Read at
    // booking time; flipping it never touches existing bookings.
    allowBookingMerge: {
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
