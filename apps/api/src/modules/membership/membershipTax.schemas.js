// Request schemas for the membership Tax consumer routes (the Zod boundary
// seam, platform/validate.js - mounted 2026-10-12). The controller keeps its
// business validation (required scheme code, finite amount) and the tax
// gateway resolves the scheme; these schemas bound SHAPE and SIZE and strip
// unknown keys, so every key the controller reads is listed here - an unlisted
// key would be silently dropped.

const { z } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// Amounts arrive as numbers or digit strings from the web forms.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();

// The effective date every read takes (defaults to today when absent).
const onDate = { date: str(10) };

module.exports = {
    listSchemes: { query: z.object(onDate) },
    resolveScheme: { params: z.object({ code: z.string().max(50) }), query: z.object(onDate) },
    quote: { body: z.object({ taxSchemeCode: str(50), amount: numberish, ...onDate }) },
};
