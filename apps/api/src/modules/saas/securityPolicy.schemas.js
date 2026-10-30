// Request schema for the SECURITY POLICY route (the Zod boundary seam,
// platform/validate.js): the subscriber's MFA policy (PUT
// /account/security-policy). The service keeps the meaning checks (the enum,
// a date only while required); this bounds shape and size and strips unknown
// keys, so both keys the service reads are listed here.

const { z } = require('../../platform/validate');

module.exports = {
    update: {
        body: z.object({
            mfaPolicy: z.string().max(10),
            // YYYY-MM-DD or empty; the service parses and validates it.
            mfaRequiredFrom: z.string().max(10).nullable().optional(),
        }),
    },
};
