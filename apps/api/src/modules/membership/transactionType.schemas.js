// Request schemas for the membership Transaction Type view (the Zod boundary
// seam, platform/validate.js - mounted 2026-10-12). The one surviving route
// is a read-only listing that takes no request part; the schema exists so the
// boundary strips any stray query key before the handler runs. Writes live on
// the AR master (/api/ar/transaction-types) and are validated there.

const { z } = require('../../platform/validate');

module.exports = {
    list: { query: z.object({}) },
};
