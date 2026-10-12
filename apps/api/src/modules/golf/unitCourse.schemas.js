// Request schemas for the Unit Course master routes (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12). The controller keeps the code
// casing and clash check, the course-type vocabulary, the integer ranges and
// the floodlight lead-time coupling; these schemas bound SHAPE and SIZE and
// strip unknown keys, so every key createUnitCourse and updateUnitCourse read
// is listed here - an unlisted key would be silently dropped.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// Counts and minutes arrive as numbers or digit strings from the web forms.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const id = fields.uuid;

// Presence matters on update ('seq' in req.body etc.), so every key stays
// optional and absent keys stay absent after the parse.
const unitCourseBody = {
    unitCourseCode: str(50),
    courseType: str(30),
    seq: numberish,
    description: str(500),
    remarks: str(500),
    completionMinutes: numberish,
    hasFloodlight: z.boolean().optional(),
    floodlightLeadMinutes: numberish,
};

const idParam = { params: z.object({ id }) };

module.exports = {
    id: idParam,
    create: { body: z.object(unitCourseBody) },
    update: { ...idParam, body: z.object({ ...unitCourseBody, isActive: z.boolean().optional() }) },
};
