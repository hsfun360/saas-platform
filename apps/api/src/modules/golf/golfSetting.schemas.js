// Request schemas for the Golf Specification route (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12). The controller keeps every
// business check (integer ranges, vocabularies, membership-type and course
// ownership, time bands and their overlap rules, the no-show type gate);
// these schemas bound SHAPE and SIZE and strip unknown keys, so every key
// save and its normalize* helpers read - the singleton scalars, the four
// tee-sheet colours, the group booking knobs and the six rule-row arrays -
// is listed here. An unlisted key would be silently dropped.

const { z } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// Counts, hours, percentages, holes and handicaps arrive as numbers or digit strings from the web forms.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const bool = z.boolean().optional();

// Shared by the scoped exception editors (normalizeScopedRules): course,
// day scope and an optional time band.
const scoped = {
    courseId: str(64),
    dayScope: str(20),
    startTime: str(8),
    endTime: str(8),
};

// Advance-booking override per membership type.
const overrideLine = z.object({ membershipTypeId: str(64), advanceBookingDays: numberish });
// Minimum players exception (normalizeMinPlayerRules).
const minPlayerLine = z.object({ ...scoped, minPlayers: numberish });
// Guest control exception (normalizeGuestControlRules).
const guestControlLine = z.object({ ...scoped, allowGuest: bool, allowMemberGuest: bool });
// Handicap LIMIT rule (normalizeHandicapLimitRules) - no time band.
const handicapLimitLine = z.object({
    courseId: str(64),
    dayScope: str(20),
    holes: numberish,
    gender: str(20),
    maxHandicap: numberish,
    latestTeeOff: str(8),
});
// Handicap ACCOMPANIMENT rule (normalizeHandicapAccompanimentRules).
const handicapAccompanimentLine = z.object({
    ...scoped,
    holes: numberish,
    appliesToBeginner: bool,
    appliesToProvisional: bool,
    minCompanions: numberish,
    companionMaxHandicapMen: numberish,
    companionMaxHandicapWomen: numberish,
    latestTeeOff: str(8),
});
// Golf Session band.
const sessionLine = z.object({ name: str(100), startTime: str(8), endTime: str(8) });
// Playing-right whitelist row and round-quota row (2026-10-15): target = a
// player type (+ optional membership type) or an affiliated club.
const ruleTarget = { playerTypeId: str(64), affiliatedClubId: str(64), membershipTypeId: str(64) };
const playingRightLine = z.object({ ...ruleTarget, ...scoped, effectiveFrom: str(10), effectiveTo: str(10) });
const roundQuotaLine = z.object({ ...ruleTarget, dayScope: str(20), period: str(10), maxRounds: numberish, maxGuestRounds: numberish });

const saveBody = z.object({
    // Advance booking
    advanceBookingDays: numberish,
    advanceBookingHours: numberish,
    allowMembershipTypeOverride: bool,
    allowBookingMerge: bool,
    overrides: z.array(overrideLine).max(200).nullable().optional(),
    // Flight rules
    minPlayersWeekday: numberish,
    minPlayersWeekend: numberish,
    bookingLockMinutes: numberish,
    bookingLimitWeekday: str(20),
    bookingLimitWeekend: str(20),
    allowSameDayBooking: bool,
    sessions: z.array(sessionLine).max(50).nullable().optional(),
    minPlayerRules: z.array(minPlayerLine).max(400).nullable().optional(),
    // Guest control
    guestControlEnabled: bool,
    allowGuestWeekday: bool,
    allowMemberGuestWeekday: bool,
    allowGuestWeekend: bool,
    allowMemberGuestWeekend: bool,
    guestControlRules: z.array(guestControlLine).max(400).nullable().optional(),
    // Handicap + junior control
    handicapControlEnabled: bool,
    juniorBookingControlEnabled: bool,
    handicapLimitRules: z.array(handicapLimitLine).max(400).nullable().optional(),
    handicapAccompanimentRules: z.array(handicapAccompanimentLine).max(400).nullable().optional(),
    // Cancellation notice + no-show penalty
    noShowControlEnabled: bool,
    cancellationNoticeHours: numberish,
    lateCancellationAction: str(20),
    noShowTransactionTypeId: str(64),
    noShowChargeBasis: str(20),
    // Rain checks (2026-10-15)
    rainCheckEnabled: bool,
    rainCheckValidityDays: numberish,
    rainCheckBasis: str(20),
    rainCheckProrate: bool,
    // Playing rights + round quotas (2026-10-15)
    playingRightsEnabled: bool,
    playingRightRules: z.array(playingRightLine).max(400).nullable().optional(),
    roundQuotaRules: z.array(roundQuotaLine).max(400).nullable().optional(),
    // Buggy management (2026-10-17)
    buggyManagementEnabled: bool,
    caddyManagementEnabled: bool,
    // Tee-sheet colours (#rrggbb)
    teeSheetColorBooked: str(20),
    teeSheetColorRegistered: str(20),
    teeSheetColorBilled: str(20),
    teeSheetColorSettled: str(20),
    // Group booking control
    groupBookingControlEnabled: bool,
    groupTentativeHoldHours: numberish,
    groupDepositDueDays: numberish,
    groupDefaultDepositPct: numberish,
    groupShareCapWeekday: numberish,
    groupShareCapWeekend: numberish,
    groupMaxTentativePerUser: numberish,
    groupNextInLineHours: numberish,
});

module.exports = {
    save: { body: saveBody },
};
