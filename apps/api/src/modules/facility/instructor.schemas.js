// Request schemas for the Instructors routes (the Zod boundary seam,
// platform/validate.js). The controller keeps the business checks (code
// shape and freeze, the email form); these schemas bound SHAPE and SIZE
// and strip unknown keys.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const bool = z.boolean().optional();
const id = fields.uuid;

const body = {
    code: str(50),
    name: str(255),
    mobile: str(40),
    email: str(255),
    specialities: str(255),
    photoUrl: str(1000),
    remarks: str(255),
    isActive: bool,
};

const idParam = { params: z.object({ id }) };

module.exports = {
    id: idParam,
    create: { body: z.object(body) },
    update: { ...idParam, body: z.object(body) },
};
