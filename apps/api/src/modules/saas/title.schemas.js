// Request schemas for the Title CONSUMER route (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12). The active-titles picker list
// takes one optional query key, the country filter (a Country.alpha2, lower-
// cased by the controller); the Tenant-Admin maintenance routes live under
// /auth/account/titles and carry their own schemas.

const { z } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();

module.exports = {
    listActive: { query: z.object({ countryCode: str(10) }) },
};
