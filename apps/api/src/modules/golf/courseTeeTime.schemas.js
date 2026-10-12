// Request schemas for the Course tee-time set routes (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12). The controller keeps the day
// scope vocabulary, the date and HH:MM checks, the integer ranges, the
// first/last cross-check and the per-set clash; these schemas bound SHAPE and
// SIZE and strip unknown keys, so every key validateHeader and saveSlots read
// is listed here - an unlisted key would be silently dropped.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// Minutes and counts arrive as numbers or digit strings from the web forms.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const id = fields.uuid;

// Presence matters (createSet checks the required keys are IN the body and
// validateHeader only touches keys that are present), so everything stays
// optional here and absent keys stay absent after the parse.
const header = {
    description: str(500),
    dayScope: str(30),
    effectiveDate: str(10),
    firstTeeTime: str(8),
    lastTeeTime: str(8),
    mustPlay18Until: str(8),
    mustPlay9Until: str(8),
    frontDeskFrom: str(8),
    intervalMinutes: numberish,
    playersPerFlight: numberish,
};

const slotLine = z.object({
    slotNumber: numberish,
    teeTime: str(8),
    maxPlayers: numberish,
    isFrontDesk: z.boolean().optional(),
    isCrossoverOnly: z.boolean().optional(),
});

const courseParam = { params: z.object({ id }) };
const setParam = { params: z.object({ id, setId: id }) };

module.exports = {
    course: courseParam,
    createSet: { ...courseParam, body: z.object(header) },
    updateSet: { ...setParam, body: z.object({ ...header, isActive: z.boolean().optional() }) },
    // The controller's own ceiling is 300 slots; the bound sits above it so
    // its friendlier message still fires.
    saveSlots: { ...setParam, body: z.object({ slots: z.array(slotLine).max(400).nullable().optional() }) },
};
