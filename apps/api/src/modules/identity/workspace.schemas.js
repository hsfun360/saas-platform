// Request schemas for the WORKSPACE and legacy role routes auth.controller.js
// still serves from auth.routes.js (the Zod boundary seam, platform/validate.js
// - mounted 2026-10-12, the sixth standards sweep): the workspace switch, the
// per-company menu catalogue behind the Role Management picker and the legacy
// flat role create. The controller keeps the membership check (the one
// security gate of a switch) and the admin-rights check on the target company;
// these schemas bound SHAPE and SIZE at the boundary and strip unknown keys,
// so every key the controller reads is listed here - an unlisted key would be
// silently dropped. The required-at-business-level keys stay optional so the
// controller's own messages still fire.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const id = fields.uuid;

// A company id, or the 'SYSTEM' sentinel the API itself emits for the platform
// workspace (companyId NULL) - the same rule as the login picker in
// auth.schemas.js: a uuid-only rule here would 400 every switch back to System
// Administration.
const workspace = z.union([id, z.literal('SYSTEM')]);

module.exports = {
    switchWorkspace: { body: z.object({ companyId: workspace.nullish() }) },
    // The Role Management picker may name the company whose entitled menus it
    // wants; omitted = the caller's active company.
    availableMenus: { query: z.object({ companyId: id.optional() }) },
    createRole: {
        body: z.object({
            companyId: id.nullable().optional(),
            roleName: str(255),
            menuIds: z.array(id).max(2000).optional(),
        }),
    },
};
