// Request schemas for the Course Closure routes (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12). The controller keeps the day
// scope vocabulary, the date and HH:MM checks, the one-year span cap, the
// both-or-neither time rule and the nine ownership check; these schemas bound
// SHAPE and SIZE and strip unknown keys, so every key validateHeader, create
// and saveDays read is listed here - an unlisted key would be silently dropped.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const id = fields.uuid;

// Presence matters (create checks the required keys are IN the body and
// validateHeader only touches keys that are present), so everything stays
// optional here and absent keys stay absent after the parse.
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
    // The nine ids stay plain strings so the controller's own "pick at least
    // one" and ownership messages fire rather than a generic uuid error.
    create: { body: z.object({ ...header, unitCourseIds: z.array(z.string().max(64)).max(50).nullable().optional() }) },
    update: { ...planParam, body: z.object({ ...header, isActive: z.boolean().optional() }) },
    // The controller's own ceiling is a year of days (366); the bound sits
    // above it so its friendlier message still fires.
    saveDays: { ...planParam, body: z.object({ days: z.array(dayLine).max(400).nullable().optional() }) },
};
