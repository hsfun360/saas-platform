// Request schemas for the Golfers master routes (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12). The controller keeps the
// handicap range, the status vocabulary and the presence semantics (an
// absent key leaves the field unchanged, null clears it); these schemas
// bound SHAPE and SIZE and strip unknown keys, so every key update reads is
// listed here - an unlisted key would be silently dropped.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// The handicap index arrives as a number or a digit string from the web form.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const id = fields.uuid;

module.exports = {
    update: {
        params: z.object({ id }),
        body: z.object({
            handicapIndex: numberish,
            handicapStatus: str(50),
            remarks: str(4000),
            isActive: z.boolean().optional(),
        }),
    },
};
