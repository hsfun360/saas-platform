// Request schemas for the Rain Check routes (the Zod boundary seam,
// platform/validate.js). The service keeps every business check (the control
// switch, the settled bill, the value ceiling, the golfer match); these
// schemas bound SHAPE and SIZE and strip unknown keys, so every key the
// handlers read is listed here - an unlisted key would be silently dropped.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const id = fields.uuid;

// The issue body (preview and issue share it): holes played, an optional
// lowered amount, the reason, and a manual rain check number when the series
// is manual.
const issueBody = z.object({
    holesPlayed: numberish,
    amount: numberish,
    reason: str(255),
    rainCheckNo: str(50),
});

module.exports = {
    registration: { params: z.object({ id }) },
    preview: { params: z.object({ id }), body: issueBody },
    issue: { params: z.object({ id }), body: issueBody },
    list: { query: z.object({ status: str(20), dateFrom: str(10), dateTo: str(10), golferId: str(64) }) },
    id: { params: z.object({ id }) },
    cancel: { params: z.object({ id }), body: z.object({ reason: str(255) }) },
};
