// Request schemas for the Facility Specification route (the Zod boundary
// seam, platform/validate.js). The controller keeps every business check
// (integer ranges, the session band rules, the membership-type ownership of
// an override line, the guest-rule scoping rules); these schemas bound SHAPE
// and SIZE and strip unknown keys, so every key save reads is listed here.

const { z } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// Counts and hours arrive as numbers or digit strings from the web forms.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const bool = z.boolean().optional();

const sessionLine = z.object({ name: str(100), startTime: str(8), endTime: str(8) });
// Advance-booking override per membership type (slice 2).
const overrideLine = z.object({ membershipTypeId: str(64), advanceBookingDays: numberish });
// Guest-control exception (slice 2).
const guestRuleLine = z.object({ facilityTypeId: str(64), dayScope: str(20), startTime: str(8), endTime: str(8), allowGuest: bool, allowMemberGuest: bool });

const saveBody = z.object({
    // Booking window
    advanceBookingDays: numberish,
    advanceBookingHours: numberish,
    allowSameDayBooking: bool,
    bookingLockMinutes: numberish,
    allowMembershipTypeOverride: bool,
    overrides: z.array(overrideLine).max(200).nullable().optional(),
    // Guest control
    guestControlEnabled: bool,
    allowGuestWeekday: bool,
    allowMemberGuestWeekday: bool,
    allowGuestWeekend: bool,
    allowMemberGuestWeekend: bool,
    guestControlRules: z.array(guestRuleLine).max(400).nullable().optional(),
    // Cancellation and no-show
    noShowControlEnabled: bool,
    cancellationNoticeHours: numberish,
    // No show (slice 4)
    lateCancellationAction: str(10),
    noShowTransactionTypeId: str(64),
    noShowChargeBasis: str(12),
    noShowGraceMinutes: numberish,
    strikeCount: numberish,
    strikeWindowDays: numberish,
    strikeSuspensionDays: numberish,
    // Control Station (slice 3)
    checkInOpenMinutes: numberish,
    autoSignOutAtClose: bool,
    // Sessions (PUT-replaced)
    sessions: z.array(sessionLine).max(50).nullable().optional(),
});

module.exports = {
    save: { body: saveBody },
};
