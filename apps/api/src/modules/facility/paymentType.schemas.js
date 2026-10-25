// Request schemas for the facility Payment Type routes (the Zod boundary
// seam, platform/validate.js). The controller keeps the class vocabulary and
// the uniqueness clash; these schemas bound SHAPE and SIZE and strip unknown keys.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const id = fields.uuid;

const typeBody = z.object({
    paymentType: str(100),
    paymentClass: str(50),
    description: str(255),
    iconUrl: str(1000),
});

const idParam = { params: z.object({ id }) };

module.exports = {
    create: { body: typeBody },
    update: { ...idParam, body: typeBody },
    setActive: { ...idParam, body: z.object({ isActive: z.boolean().optional() }) },
};
