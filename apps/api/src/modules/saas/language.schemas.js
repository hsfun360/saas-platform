// Request schemas for the Language reference routes (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12, the sixth standards sweep). The
// controller keeps every business check (the lowercase code normalisation, the
// required code and name, the duplicate check); these schemas bound SHAPE and
// SIZE and strip unknown keys, so every key the controller reads is listed
// here - an unlisted key would be silently dropped.
//
// Language is keyed by its ISO 639 code (Language.languageCode, STRING(10)),
// not a UUID, so the key is bound as a short string.

const { z } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();

const codeParam = { params: z.object({ languageCode: z.string().max(10) }) };

module.exports = {
    create: { body: z.object({ languageCode: str(10), name: str(255) }) },
    update: { ...codeParam, body: z.object({ name: str(255), isActive: z.boolean().optional() }) },
    code: codeParam,
};
