// Request schemas for the Facility Specification route (the Zod boundary
// seam, platform/validate.js). The controller keeps every business check
// (integer ranges, the session band rules); these schemas bound SHAPE and
// SIZE and strip unknown keys, so every key save reads is listed here - an
// unlisted key would be silently dropped.

const { z } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// Counts and hours arrive as numbers or digit strings from the web forms.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const bool = z.boolean().optional();

const sessionLine = z.object({ name: str(100), startTime: str(8), endTime: str(8) });

const saveBody = z.object({
    // Booking window
    advanceBookingDays: numberish,
    advanceBookingHours: numberish,
    allowSameDayBooking: bool,
    bookingLockMinutes: numberish,
    // Guest control
    guestControlEnabled: bool,
    allowGuestWeekday: bool,
    allowMemberGuestWeekday: bool,
    allowGuestWeekend: bool,
    allowMemberGuestWeekend: bool,
    // Cancellation and no-show
    noShowControlEnabled: bool,
    cancellationNoticeHours: numberish,
    // Sessions (PUT-replaced)
    sessions: z.array(sessionLine).max(50).nullable().optional(),
});

module.exports = {
    save: { body: saveBody },
};
