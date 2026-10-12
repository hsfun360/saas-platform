// Request schemas for the No-show Charges routes (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12, the fifth standards sweep).
//
// The controller keeps every business check (date format, the status
// vocabulary, pending-only transitions, the waive reason); these schemas
// bound SHAPE and SIZE at the boundary and strip unknown keys, so every key
// the controller reads is listed here - an unlisted key would be silently
// dropped.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const id = fields.uuid;

const idParam = { params: z.object({ id }) };

module.exports = {
    list: { query: z.object({ dateFrom: str(10), dateTo: str(10), status: str(20) }) },
    id: idParam,
    waive: { ...idParam, body: z.object({ reason: str(255) }) },
};
