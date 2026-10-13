// Request schema for the MY DASHBOARD FAVORITES replace route (the Zod
// boundary seam, platform/validate.js - mounted 2026-10-12, the sixth
// standards sweep): the caller's own starred screens in the active workspace,
// saved whole as an ordered list of Menu ids. The controller keeps the
// unknown-menu drop, the dedupe and its own 100-entry cap; this schema bounds
// SHAPE and SIZE at the boundary and strips unknown keys, so the one body key
// the controller reads is listed here - an unlisted key would be silently
// dropped. Menu keys on a UUID.

const { z, fields } = require('../../platform/validate');

module.exports = {
    replace: {
        body: z.object({
            // A non-array is left to the controller's own "must be an array" message.
            menuIds: z.array(fields.uuid).max(1000).nullable().optional(),
        }),
    },
};
