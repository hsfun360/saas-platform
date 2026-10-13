// Request schemas for the ACCOUNT LANGUAGE routes (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12, the sixth standards sweep): the
// subscriber's language subset + default (PUT /account/languages, applied by
// applyAccountLanguages which receives the body whole) and a user's own pick
// (PATCH /me/language). The controller keeps the catalogue checks (active
// codes only, the default within the set, the user's allowed options); these
// schemas bound SHAPE and SIZE and strip unknown keys, so every key the
// controller and its helper read is listed here - an unlisted key would be
// silently dropped. Codes are BCP 47-style tags (Language.languageCode).

const { z } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();

module.exports = {
    updateAccount: {
        body: z.object({
            // Replaced wholesale; a non-array is treated as "none" by the helper.
            languageCodes: z.array(z.string().max(16)).max(500).nullable().optional(),
            defaultLanguageCode: str(16),
        }),
    },
    setMine: { body: z.object({ language: str(16) }) },
};
