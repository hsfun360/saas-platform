// Request schemas for the Country reference routes (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12, the sixth standards sweep). The
// controller keeps every business check (the lowercase key lookup, the '+'
// prefix on dial codes, the localized-names merge that keeps `name` in step
// with the English entry); these schemas bound SHAPE and SIZE and strip unknown
// keys, so every key updateCountry reads is listed here - an unlisted key would
// be silently dropped.
//
// Country is keyed by the ISO 3166-1 alpha-2 code (Country.alpha2, STRING(2),
// plus the 'zz' Others row), not a UUID, so the param is bound as a short string.

const { z } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();

const alpha2Param = { params: z.object({ alpha2: z.string().max(2) }) };

module.exports = {
    update: {
        ...alpha2Param,
        body: z.object({
            isActive: z.boolean().optional(),
            dialCode: str(10),
            // { "<languageCode>": "name" }; an empty value clears that language.
            names: z.record(z.string().max(10), z.string().max(255).nullable()).nullable().optional(),
        }),
    },
};
