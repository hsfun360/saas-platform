// Request schemas for the Membership Status master routes (the Zod boundary
// seam, platform/validate.js - mounted 2026-10-12). The controller keeps the
// class/control vocabularies, the hex-colour rule and the sibling-company
// copy guard; these schemas bound SHAPE and SIZE and strip unknown keys, so
// every key the controller reads is listed here - an unlisted key would be
// silently dropped.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const id = fields.uuid;

const statusFields = {
    membershipStatus: str(100),
    statusClass: str(30),
    actionControl: str(30),
    chargeControl: str(30),
    description: str(500),
    statusColor: str(20),
};

const idParam = { params: z.object({ id }) };

module.exports = {
    create: { body: z.object(statusFields) },
    // PATCH: any subset, plus the enable/disable flag.
    update: { ...idParam, body: z.object({ ...statusFields, isActive: z.boolean().optional() }) },
    // First-time-setup copy from a sibling company; statusIds absent = copy all.
    copy: {
        body: z.object({
            fromCompanyId: str(64),
            statusIds: z.array(z.string().max(64)).max(500).nullable().optional(),
        }),
    },
};
