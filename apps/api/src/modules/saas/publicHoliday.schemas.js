// Request schemas for the Public Holiday CONSUMER route (the Zod boundary
// seam, platform/validate.js - mounted 2026-10-12). The product-calendar list
// takes one optional query key, the year (parseInt'd by the controller; a
// non-number simply means "every year"); the Tenant-Admin maintenance routes
// live under /auth/account/public-holidays and carry their own schemas.

const { z } = require('../../platform/validate');

// Query strings arrive as strings; a number is accepted for symmetry.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();

module.exports = {
    listActive: { query: z.object({ year: numberish }) },
};
