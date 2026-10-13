// Request schemas for the Currency reference routes (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12, the sixth standards sweep). The
// controller keeps every business check (the uppercase alpha-3 rule, the
// required name, the duplicate check, the Number.isInteger guards on the
// numeric code and minor unit); these schemas bound SHAPE and SIZE and strip
// unknown keys, so every key the controller reads is listed here - an unlisted
// key would be silently dropped.
//
// Currency is keyed by its ISO 4217 alpha-3 code (Currency.code, STRING(3)),
// not a UUID, so the key is bound as a short string. The create body's code is
// bounded loosely so the controller's own "3-letter ISO 4217 code" message fires.

const { z } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// The integer fields arrive as numbers from the form; a non-integer is ignored
// by the controller, so the shape only has to be finite.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();

const codeParam = { params: z.object({ code: z.string().max(3) }) };

const fields = {
    name: str(255),
    symbol: str(20),
    numericCode: numberish,
    minorUnit: numberish,
};

module.exports = {
    create: { body: z.object({ ...fields, code: str(10) }) },
    update: { ...codeParam, body: z.object({ ...fields, isActive: z.boolean().optional() }) },
    code: codeParam,
};
