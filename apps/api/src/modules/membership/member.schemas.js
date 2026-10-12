// Request schemas for the flat Members search routes (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12). The controller keeps the kind
// vocabulary and the paging clamp; these schemas bound SHAPE and SIZE and strip
// unknown keys, so every query key the controller reads is listed here.

const { z } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// Paging offsets arrive as digit strings on the query string.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();

module.exports = {
    list: { query: z.object({ q: str(200), kind: str(20), status: str(64), offset: numberish }) },
};
