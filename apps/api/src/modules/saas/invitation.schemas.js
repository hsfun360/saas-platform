// Request schemas for the COLLABORATOR INVITATION routes (the Zod boundary
// seam, platform/validate.js - mounted 2026-10-12, the sixth standards sweep):
// the admin side (create, list, revoke for a company the caller administers)
// and the invitee side (accept, decline - matched to the caller's own email).
// The controller keeps the consent gate, the admin-rights check on the target
// company, the role ownership check and the duplicate/expiry rules; these
// schemas bound SHAPE and SIZE at the boundary and strip unknown keys, so
// every key the controller reads is listed here - an unlisted key would be
// silently dropped. Invitation, Company and Role all key on a UUID.

const { z, fields } = require('../../platform/validate');

const id = fields.uuid;
const optId = id.nullable().optional();

module.exports = {
    create: {
        body: z.object({
            companyId: optId, // omitted = the caller's active company
            email: fields.email.nullish(), // absent is left to the controller's "Email is required."
            roleId: optId,
        }),
    },
    listCompany: { query: z.object({ companyId: id.optional() }) },
    id: { params: z.object({ id }) },
};
