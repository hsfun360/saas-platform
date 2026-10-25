// Request schemas for the Facility Closure routes (the Zod boundary seam,
// platform/validate.js). The controller keeps the day scope vocabulary, the
// date and HH:MM checks, the one-year span cap, the both-or-neither time rule
// and the type / unit ownership checks; these schemas bound SHAPE and SIZE
// and strip unknown keys, so every key the controller reads is listed here.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const id = fields.uuid;

const header = {
    description: str(500),
    dayScope: str(30),
    dateFrom: str(10),
    dateTo: str(10),
    startTime: str(8),
    endTime: str(8),
};

const dayLine = z.object({
    closureDate: str(10),
    startTime: str(8),
    endTime: str(8),
    isActive: z.boolean().optional(),
});

const planParam = { params: z.object({ planId: id }) };

module.exports = {
    plan: planParam,
    // The ids stay plain strings so the controller's own ownership messages
    // fire rather than a generic uuid error.
    create: { body: z.object({ ...header, facilityTypeId: str(64), facilityIds: z.array(z.string().max(64)).max(200).nullable().optional() }) },
    update: { ...planParam, body: z.object({ ...header, isActive: z.boolean().optional() }) },
    // The controller's own ceiling is a year of days (366); the bound sits
    // above it so its friendlier message still fires.
    saveDays: { ...planParam, body: z.object({ days: z.array(dayLine).max(400).nullable().optional() }) },
};
