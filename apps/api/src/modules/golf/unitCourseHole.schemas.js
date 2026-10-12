// Request schemas for the Unit Course hole-grid routes (the Zod boundary
// seam, platform/validate.js - mounted 2026-10-12). The controller keeps the
// exact-range numbering per course type, the par and handicap-index ranges
// with their odd/even parity, and the remarks ceiling; these schemas bound
// SHAPE and SIZE and strip unknown keys, so every key saveHoles reads off a
// hole line is listed here - an unlisted key would be silently dropped.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// Numbers arrive as numbers or digit strings from the web grid.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const id = fields.uuid;

const holeLine = z.object({
    holeNumber: numberish,
    par: numberish,
    handicapIndex: numberish,
    remarks: str(500), // the controller's own ceiling is 255
});

const idParam = { params: z.object({ id }) };

module.exports = {
    id: idParam,
    // A grid is at most 18 holes; the bound sits above so the controller's
    // "needs exactly N holes" message still fires on an oversized post.
    saveHoles: { ...idParam, body: z.object({ holes: z.array(holeLine).max(40).nullable().optional() }) },
};
