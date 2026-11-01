// Request schemas for the SECURITY POLICY routes (the Zod boundary seam,
// platform/validate.js): the subscriber's MFA policy, its trusted-device rule
// and its registered-workstation switch (PUT /account/security-policy), and
// the registered-workstation management routes. The service keeps the meaning
// checks (the enum, a date only while required, the 1-90 day window, the
// unique station name); this bounds shape and size and strips unknown keys,
// so every key the service reads is listed here.

const { z, fields } = require('../../platform/validate');

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
            // Registered workstations (2026-11-01): whether a registered
            // station lets staff roles skip the code. Omitted = keep stored.
            workstationTrustEnabled: z.boolean().optional(),
            // Remote-access grants (2026-11-01): the ceiling in days an
            // approver may give. Omitted = keep stored.
            remoteAccessGrantMaxDays: z.number().int().nullable().optional(),
        }),
    },
    // POST /account/workstations - register THIS browser under a name.
    registerWorkstation: {
        body: z.object({ name: fields.requiredText(100) }),
    },
    // DELETE /account/workstations/:id
    workstationId: {
        params: z.object({ id: fields.uuid }),
    },
};
