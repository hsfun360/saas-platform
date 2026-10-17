// Request schemas for the Course master routes (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12). The controller keeps the code
// casing and clash check, the integer ranges, and the nine-pairing rules
// (resolveNines reads the four nine ids off the body); these schemas bound
// SHAPE and SIZE and strip unknown keys, so every key createCourse,
// updateCourse and resolveNines read is listed here - an unlisted key would be
// silently dropped. The photo upload is multipart (req.file only) and reads
// no request part, so it stays bare.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// Counts and minutes arrive as numbers or digit strings from the web forms.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const id = fields.uuid;

// Presence matters on update ('displaySequence' in req.body etc.), so every
// key stays optional and absent keys stay absent after the parse.
const courseBody = {
    courseCode: str(50),
    displaySequence: numberish,
    description: str(500),
    firstNineId: str(64),
    secondNineId: str(64),
    alternateNineId: str(64),
    nightNineId: str(64),
    crossOverMinutes: numberish,
    photo: str(2048), // the public URL returned by the upload door
    buggyCompulsory: z.boolean().optional(),
};

const idParam = { params: z.object({ id }) };

module.exports = {
    id: idParam,
    create: { body: z.object(courseBody) },
    update: { ...idParam, body: z.object({ ...courseBody, isActive: z.boolean().optional() }) },
};
