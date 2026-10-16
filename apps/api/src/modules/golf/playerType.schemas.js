// Request schemas for the golf Player Type master routes (the Zod boundary
// seam, platform/validate.js). The controller keeps the base-identity
// vocabulary check, the code lock on system rows, the uniqueness clash and
// the in-use guard; these schemas bound SHAPE and SIZE and strip unknown
// keys, so every key normalizeBody reads is listed here.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const id = fields.uuid;

const typeBody = z.object({
    code: str(20),
    description: str(255),
    baseIdentity: str(20),
    requiresApproval: z.boolean().optional(),
    sortOrder: numberish,
});

const idParam = { params: z.object({ id }) };

module.exports = {
    create: { body: typeBody },
    update: { ...idParam, body: typeBody },
    setActive: { ...idParam, body: z.object({ isActive: z.boolean().optional() }) },
    remove: idParam,
};
