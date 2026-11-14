// Request schemas for the Utility Items routes (the Zod boundary seam,
// platform/validate.js). The controller keeps the business checks (code
// shape and freeze, the behaviour switches, the fee item, the unit codes);
// these schemas bound SHAPE and SIZE and strip unknown keys.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const bool = z.boolean().optional();
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const id = fields.uuid;

const itemBody = {
    code: str(50),
    description: str(255),
    trackUnits: bool,
    returnRequired: bool,
    stockQuantity: numberish,
    maxPerPerson: numberish,
    feeTransactionTypeId: str(64),
    guestsAllowed: bool,
    visitingMembersAllowed: bool,
    requiresEntry: bool,
    iconUrl: str(1000),
    sortOrder: numberish,
    isActive: bool,
};

const unitBody = {
    code: str(50),
    location: str(255),
    remarks: str(255),
    sortOrder: numberish,
    isActive: bool,
};

const idParam = { params: z.object({ id }) };
const unitParam = { params: z.object({ id, unitId: id }) };

module.exports = {
    id: idParam,
    create: { body: z.object(itemBody) },
    update: { ...idParam, body: z.object(itemBody) },
    unitCreate: { ...idParam, body: z.object(unitBody) },
    unitUpdate: { ...unitParam, body: z.object(unitBody) },
    unit: unitParam,
    generate: { ...idParam, body: z.object({ prefix: str(20), from: numberish, to: numberish, pad: numberish, location: str(255), preview: bool }) },
};
