// Request schema for the SECURITY POLICY route (the Zod boundary seam,
// platform/validate.js): the subscriber's MFA policy and its trusted-device
// rule (PUT /account/security-policy). The service keeps the meaning checks
// (the enum, a date only while required, the 1-90 day window); this bounds
// shape and size and strips unknown keys, so every key the service reads is
// listed here.

const { z } = require('../../platform/validate');

module.exports = {
    update: {
        body: z.object({
            mfaPolicy: z.string().max(10),
            // YYYY-MM-DD or empty; the service parses and validates it.
            mfaRequiredFrom: z.string().max(10).nullable().optional(),
            // Trusted devices ("don't ask again on this device"): whether the
            // option is offered at all, and the window in days (2026-11-01).
            // Omitted = keep the stored value.
            trustedDevicesAllowed: z.boolean().optional(),
            trustedDeviceDays: z.number().int().nullable().optional(),
        }),
    },
};
