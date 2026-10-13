// Request schemas for the ACCOUNT CURRENCY route (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12, the sixth standards sweep): the
// subscriber's currency subset + default (PUT /account/currencies, applied by
// applyAccountCurrencies which receives the body whole). The controller keeps
// the catalogue checks (active ISO 4217 codes only, the default within the
// set); this schema bounds SHAPE and SIZE and strips unknown keys, so every
// key the helper reads is listed here - an unlisted key would be silently
// dropped.

const { z } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();

module.exports = {
    updateAccount: {
        body: z.object({
            // Replaced wholesale; a non-array is treated as "none" by the helper.
            currencyCodes: z.array(z.string().max(8)).max(500).nullable().optional(),
            defaultCurrencyCode: str(8),
        }),
    },
};
