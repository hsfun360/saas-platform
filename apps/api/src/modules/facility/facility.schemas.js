// Request schemas for the Facilities (units) routes (the Zod boundary seam,
// platform/validate.js). The controller keeps the business checks (type
// ownership and freeze, code shape, capacity by mode); these schemas bound
// SHAPE and SIZE and strip unknown keys, so every key validateUnit reads is
// listed here.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const bool = z.boolean().optional();
const id = fields.uuid;

const body = {
    facilityTypeId: str(64),
    code: str(50),
    name: str(255),
    location: str(255),
    isIndoor: bool,
    isFloodlit: bool,
    capacity: numberish,
    pictureUrl: str(1000),
    remarks: str(2000),
    sortOrder: numberish,
    isActive: bool,
};

const idParam = { params: z.object({ id }) };

module.exports = {
    id: idParam,
    list: { query: z.object({ facilityTypeId: str(64) }) },
    create: { body: z.object(body) },
    update: { ...idParam, body: z.object(body) },
};
