// Request schemas for the Facility Types routes (the Zod boundary seam,
// platform/validate.js). The controller keeps the business checks (code
// shape, usage-mode vocabulary and freeze, integer ranges, opening-hour
// pairs, mode normalisation); these schemas bound SHAPE and SIZE and strip
// unknown keys, so every key validateType reads is listed here.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const bool = z.boolean().optional();
const id = fields.uuid;

// Presence matters (validateType only touches keys that are present), so
// everything stays optional here and absent keys stay absent after the parse.
const body = {
    code: str(50),
    description: str(255),
    usageMode: str(20),
    iconUrl: str(1000),
    sortOrder: numberish,
    isActive: bool,
    // slot mode
    maxParticipants: numberish,
    minParticipants: numberish,
    maxSlotsPerDayWeekday: numberish,
    maxSlotsPerDayWeekend: numberish,
    maxConsecutiveSlots: numberish,
    advanceBookingDays: numberish,
    // entry mode
    capacity: numberish,
    // issue mode
    trackUnits: bool,
    maxIssuePerPatron: numberish,
    // opening hours
    openTimeWeekday: str(8),
    closeTimeWeekday: str(8),
    openTimeWeekend: str(8),
    closeTimeWeekend: str(8),
    // guest policy
    guestsAllowed: bool,
    memberGuestsAllowed: bool,
    maxGuestsPerBooking: numberish,
    hostMustBePresent: bool,
    // slice 2: default fees + approval
    feeTransactionTypeId: str(64),
    guestFeeTransactionTypeId: str(64),
    requiresApproval: bool,
};

const idParam = { params: z.object({ id }) };

module.exports = {
    id: idParam,
    create: { body: z.object(body) },
    update: { ...idParam, body: z.object(body) },
};
