const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// Facility Specification - the per-company facility settings SINGLETON
// (pattern of golf.GolfSetting; structure approved 2026-10-25). Holds the
// club-wide defaults and master switches; a Facility Type overrides the
// limits that differ (advance days, slots per day, guest policy). Maintained
// at /facility/settings. Later slices add their own columns (booking limit
// scope, no-show detail, classes switch) - see docs/systems/facility-management.md.
//
// BOOKING WINDOW RULE (golf's, binding from slice 2): the window for date D
// opens at 00:00 of (D - effectiveDays) MINUS advanceBookingHours, club-local;
// effectiveDays = the Facility Type's advanceBookingDays when set, else the
// general days here.
const FacilitySetting = sequelize.define('FacilitySetting', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // One row per company (Control-Plane value ref).
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // General booking window in days.
    advanceBookingDays: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 7,
    },
    // Early-opening hours BEFORE midnight (0-23), club-wide.
    advanceBookingHours: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    // OFF = the window starts tomorrow; today's slots are taken only by
    // Control Station registration.
    allowSameDayBooking: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // How long a clicked slot stays claimed while the booking is keyed (1-60).
    bookingLockMinutes: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 5,
    },
    // Guest control master switch. OFF = no guest restriction anywhere (the
    // allow flags, the Facility Type guest policy and the rule rows are
    // stored but ignored).
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
    // Cancellation notice + no-show master switch (slice 4 adds the charge
    // and strike detail columns).
    noShowControlEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // Hours of notice a cancellation needs (0 = no notice rule).
    cancellationNoticeHours: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 24,
    },
    // Slice 2: when ON, facility.AdvanceBookingOverride rows replace the
    // general / type days for their membership types (privileged earlier
    // booking).
    allowMembershipTypeOverride: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // ---- slice 3 (structures approved 2026-10-26) ----
    // A booked slot is checked in from this many minutes before its start
    // until its end.
    checkInOpenMinutes: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 30,
    },
    // The end-of-day sweep signs out every registration still in at the
    // type's close time.
    autoSignOutAtClose: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // ---- slice 4 (structures approved 2026-10-26) ----
    // 'charge' raises the late-cancel charge and lets the cancel through;
    // 'refuse' refuses a cancel inside the notice (the desk may waive).
    lateCancellationAction: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'charge',
    },
    // The no-show item priced; NULL = the active no-show item scoped to the
    // facility type, else the general one, else raised unpriced.
    noShowTransactionTypeId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // 'booking' | 'slot' | 'participant'.
    noShowChargeBasis: {
        type: DataTypes.STRING(12),
        allowNull: false,
        defaultValue: 'booking',
    },
    // A booked slot may be marked no-show once start + grace has passed.
    noShowGraceMinutes: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 15,
    },
    // N counted no-shows in M days suspend booking for S days.
    strikeCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 3,
    },
    strikeWindowDays: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 90,
    },
    strikeSuspensionDays: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 30,
    },
    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: FACILITY_SCHEMA,
    tableName: 'FacilitySetting',
    timestamps: true,
    indexes: [
        { name: 'UX_FacilitySetting_Company', fields: ['companyId'], unique: true },
    ],
});

module.exports = FacilitySetting;
