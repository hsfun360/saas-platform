// Request schemas for the facility Transaction Type routes and their pricing
// sub-routes (the Zod boundary seam, platform/validate.js). The controllers
// keep the vocabularies, the ownership checks, the default-conflict rule and
// the cell validation; these schemas bound SHAPE and SIZE and strip unknown
// keys, so every key normalizeBody, the rate controller and normalizeCells
// read is listed here.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const id = fields.uuid;

const typeBody = z.object({
    transactionType: str(100),
    chargeType: str(50),
    feeBasis: str(50),
    facilityTypeId: str(64),
    description: str(255),
    participantType: str(50),
    taxSchemeCode: str(100),
    allowPriceOverride: z.boolean().optional(),
    iconUrl: str(1000),
});

const cellLine = z.object({
    participantType: str(50),
    dayScope: str(30),
    sessionId: str(64),
    amount: numberish,
});

const rateBody = z.object({
    effectiveDate: str(10),
    flatAmount: numberish,
    cells: z.array(cellLine).max(500).nullable().optional(),
});
const activeBody = z.object({ isActive: z.boolean().optional() });

const idParam = { params: z.object({ id }) };
const rateParam = { params: z.object({ id, rateId: id }) };

module.exports = {
    id: idParam,
    create: { body: typeBody },
    update: { ...idParam, body: typeBody },
    setActive: { ...idParam, body: activeBody },
    rateList: idParam,
    rateCreate: { ...idParam, body: rateBody },
    rateUpdate: { ...rateParam, body: rateBody },
    rateSetActive: { ...rateParam, body: activeBody },
    rateRemove: rateParam,
};
