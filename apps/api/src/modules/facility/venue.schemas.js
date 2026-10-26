// Request schemas for the Venues routes (the Zod boundary seam,
// platform/validate.js). The controller keeps the business checks (code
// shape, the unit ownership, the freeze once sessions exist, the capacity
// range); these schemas bound SHAPE and SIZE and strip unknown keys.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const bool = z.boolean().optional();
const id = fields.uuid;

const body = {
    code: str(50),
    name: str(255),
    description: str(255),
    facilityId: str(64),
    capacity: numberish,
    location: str(255),
    remarks: str(255),
    isActive: bool,
};

const idParam = { params: z.object({ id }) };

module.exports = {
    id: idParam,
    create: { body: z.object(body) },
    update: { ...idParam, body: z.object(body) },
};
