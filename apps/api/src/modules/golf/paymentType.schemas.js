// Request schemas for the golf Payment Type master routes (the Zod boundary
// seam, platform/validate.js - mounted 2026-10-12). The controller keeps the
// payment-class vocabulary check and the uniqueness clash; these schemas
// bound SHAPE and SIZE and strip unknown keys, so every key normalizeBody
// reads is listed here - an unlisted key would be silently dropped.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const id = fields.uuid;

const typeBody = z.object({
    paymentType: str(100),
    paymentClass: str(50),
    description: str(255),
    iconUrl: str(255),
});

const idParam = { params: z.object({ id }) };

module.exports = {
    create: { body: typeBody },
    update: { ...idParam, body: typeBody },
    setActive: { ...idParam, body: z.object({ isActive: z.boolean().optional() }) },
};
