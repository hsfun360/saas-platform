// Request schemas for the golf Affiliated / Reciprocal Club master routes
// (the Zod boundary seam, platform/validate.js). The controller keeps the
// kind and period vocabularies, the player-type check, the uniqueness clash
// and the in-use guard; these schemas bound SHAPE and SIZE and strip unknown
// keys, so every key normalizeBody reads is listed here.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const bool = z.boolean().optional();
const id = fields.uuid;

const clubBody = z.object({
    code: str(20),
    name: str(255),
    kind: str(20),
    playerTypeId: str(64),
    agreementFrom: str(10),
    agreementTo: str(10),
    allowChargeToHomeClub: bool,
    maxGuestsPerVisit: numberish,
    maxVisitsPerPlayer: numberish,
    maxVisitsPeriod: str(10),
    maxVisitsPerYear: numberish,
    visitFeeTransactionTypeId: str(64),
    requiresApproval: bool,
    contactName: str(255),
    contactEmail: str(255),
    contactPhone: str(30),
    addressLine1: str(255),
    addressLine2: str(255),
    city: str(100),
    state: str(100),
    postalCode: str(20),
    countryCode: str(2),
    remarks: str(255),
    sortOrder: numberish,
});

const idParam = { params: z.object({ id }) };

module.exports = {
    create: { body: clubBody },
    update: { ...idParam, body: clubBody },
    setActive: { ...idParam, body: z.object({ isActive: z.boolean().optional() }) },
    remove: idParam,
};
