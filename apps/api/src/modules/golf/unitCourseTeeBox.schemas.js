// Request schemas for the Unit Course tee-box routes (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12). The controller keeps the colour
// code casing and uniqueness, the hex check, the seq and distance ranges, the
// measurement vocabulary and the hole-range membership; these schemas bound
// SHAPE and SIZE and strip unknown keys, so every key saveTeeBoxes reads off
// a tee-box header and its distance lines is listed here - an unlisted key
// would be silently dropped.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// Numbers arrive as numbers or digit strings from the web grid.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const id = fields.uuid;

const distanceLine = z.object({
    holeNumber: numberish,
    distance: numberish,
});

const teeBoxLine = z.object({
    colorCode: str(50), // the controller's own ceiling is 20
    seq: numberish,
    colorHex: str(16),
    description: str(500), // the controller's own ceiling is 255
    measurementUnit: str(20),
    distances: z.array(distanceLine).max(40).nullable().optional(),
});

const idParam = { params: z.object({ id }) };

module.exports = {
    id: idParam,
    saveTeeBoxes: { ...idParam, body: z.object({ teeBoxes: z.array(teeBoxLine).max(50).nullable().optional() }) },
};
