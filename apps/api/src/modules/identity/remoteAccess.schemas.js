// Request schemas for the REMOTE-ACCESS routes (the Zod boundary seam,
// platform/validate.js): the sign-in-screen request (purpose token + reason)
// and the Access Requests decisions. The service keeps the meaning checks
// (the token's purpose, the day ceiling, the row's status); this bounds shape
// and size and strips unknown keys, so every key the service reads is listed.

const { z, fields } = require('../../platform/validate');

const note = z.string().trim().max(500).nullable().optional();

module.exports = {
    // POST /remote-access/request
    request: {
        body: z.object({
            token: fields.token,
            reason: note,
        }),
    },
    // POST /account/remote-access/:id/approve
    approve: {
        params: z.object({ id: fields.uuid }),
        body: z.object({ days: z.number().int(), note }),
    },
    // POST /account/remote-access/:id/reject
    reject: {
        params: z.object({ id: fields.uuid }),
        body: z.object({ note }),
    },
    // POST /account/remote-access/grants
    grant: {
        body: z.object({ userId: fields.uuid, days: z.number().int(), note }),
    },
    // DELETE /account/remote-access/:id
    grantId: {
        params: z.object({ id: fields.uuid }),
    },
};
