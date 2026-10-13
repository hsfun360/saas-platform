// Request schemas for the COMPANY WEEKEND DAYS maintenance routes under
// /auth/companies/:companyId/weekend-days (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12, the sixth standards sweep). The
// controller keeps the admin-rights check on the target company and the
// weekday-number rule (1 = Monday ... 7 = Sunday, parsed from numbers or
// digit strings); these schemas bound SHAPE and SIZE at the boundary and strip
// unknown keys, so the one body key the controller reads is listed here - an
// unlisted key would be silently dropped. The consumer list (/api/weekend-days)
// reads no request part and stays bare.

const { z, fields } = require('../../platform/validate');

const companyParam = { params: z.object({ companyId: fields.uuid }) };

module.exports = {
    companyId: companyParam,
    set: {
        ...companyParam,
        body: z.object({
            // Replaced whole; a non-array is left to the controller's own message.
            weekendDays: z.array(z.union([z.number(), z.string().max(4)])).max(14).nullable().optional(),
        }),
    },
};
