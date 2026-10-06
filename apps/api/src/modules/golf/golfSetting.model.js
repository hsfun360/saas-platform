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
    // Same-day booking (user decision 2026-09-21, default OFF): when OFF the
    // booking window STARTS TOMORROW (club-local) - today's flights are not
    // bookable at all; golfers take today's flights by front-desk
    // REGISTRATION (the registration stage owns walk-ins). ON = the window
    // starts today. The window END stays the advance days + hours rule.
    allowSameDayBooking: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // Booking limit per day type (user decisions 2026-10-01; replaces the
    // 2026-09-20 oneBookingPerDay boolean - a marker-guarded boot migration
    // in app.js copied the old flag and dropped the column):
    //   'none'    - no limit
    //   'day'     - one active booking per play date (the old ON behavior)
    //   'session' - one active booking per GolfSession band (Tropicana's
    //               weekend/PH rule; a tee time outside every band is
    //               unconstrained)
    // Counted when the member is the BOOKER or a 'member' player line;
    // member-as-guest lines are NOT counted, cancelled bookings free the
    // slot. Day type via the calendar seam (holidays = weekend). Enforced in
    // the BOOKING channel only (availability hides, lock/create refuse); the
    // front desk stays seats-authoritative.
    bookingLimitWeekday: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'day',
    },
    bookingLimitWeekend: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'day',
    },
    // Flight-lock duration in minutes (user decision 2026-09-20): how long a
    // clicked flight stays claimed (whole flight incl. crossover cell) while
    // the player list is keyed. 1-60; countdown shown on the player screen.
    bookingLockMinutes: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 5,
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
    // Tee-sheet seat-dot colours (user request 2026-09-29): the front desk
    // paints one dot per player, coloured by how far through the day they
    // are - booked (not arrived) / registered / billed (open bill) /
    // settled; a blank outline is a free seat. Hex '#rrggbb'; defaults
    // chosen AA-legible in both themes.
    teeSheetColorBooked: {
        type: DataTypes.STRING(7),
        allowNull: false,
        defaultValue: '#2563eb',
    },
    teeSheetColorRegistered: {
        type: DataTypes.STRING(7),
        allowNull: false,
        defaultValue: '#f59e0b',
    },
    teeSheetColorBilled: {
        type: DataTypes.STRING(7),
        allowNull: false,
        defaultValue: '#8b5cf6',
    },
    teeSheetColorSettled: {
        type: DataTypes.STRING(7),
        allowNull: false,
        defaultValue: '#16a34a',
    },
    // Handicap control (user decisions 2026-09-29, Tropicana procedure 2) -
    // the master switch. OFF = no restriction (HandicapLimitRule and
    // HandicapAccompanimentRule rows are stored but ignored). ON = the
    // booking channel REFUSES violations; the front desk registers with a
    // WARNING (seats-authoritative, user decision).
    handicapControlEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // Junior-booking control (Tropicana procedure 4.3; user decision
    // 2026-10-05). When ON, a JUNIOR member (a dependent whose relationship is
    // son/daughter/ward) may not be in a booking unless their PRINCIPAL (the
    // parent, principalMemberId) is also a player; a junior with no principal
    // on record needs at least one adult (non-junior) member in the flight.
    // Booking REFUSES, the front desk WARNS (same split as handicap control).
    juniorBookingControlEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // Cancellation notice + no-show penalty (Tropicana procedure "24 hours
    // minimum notice" / "No-show charge RM80.00 + 5%"; user decisions
    // 2026-10-06) - the master switch. OFF = cancel any time, no penalties.
    // ON = a cancel less than `cancellationNoticeHours` before the booking's
    // FIRST tee time (club-local) is a LATE cancellation handled per
    // `lateCancellationAction`, and the desk's no-show review posts the
    // penalty (golf.NoShowCharge) to the BOOKER's account.
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
    // 'charge' - the cancel is allowed (seat freed) and the no-show charge is
    //            posted, waivable with a reason at cancel time;
    // 'refuse' - the booking channel refuses the cancel inside the notice
    //            window (the booking stands and becomes a no-show if not taken).
    lateCancellationAction: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'charge',
    },
    // The golf TransactionType (chargeType 'no-show') pricing the penalty:
    // its flat rate card + its tax scheme (RM80 + 5% = 80.00 + a 5% scheme).
    // Same-company value ref, required while the control is ON.
    noShowTransactionTypeId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // 'player' - quantity = the number of no-show players (per-head penalty)
    // 'booking' - one flat charge per booking regardless of players
    noShowChargeBasis: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'player',
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
