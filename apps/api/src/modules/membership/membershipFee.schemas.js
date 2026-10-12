// Request schemas for the Membership Fee master routes (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12). The controller keeps the
// installment arithmetic (stage count, stage totals, interval vocabulary) and
// the AR catalog check; these schemas bound SHAPE and SIZE and strip unknown
// keys, so every key validateFeePayload reads is listed here - an unlisted key
// would be silently dropped.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// Amounts and counts arrive as numbers or digit strings from the web forms.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const id = fields.uuid;

// One installment stage row (the controller caps the count at 120).
const stageLine = z.object({ stageNo: numberish, amount: numberish });

const feeBody = z.object({
    membershipFeeCode: str(100),
    description: str(500),
    taxSchemeCode: str(50),
    transactionTypeId: str(64),
    amount: numberish,
    allowInstallment: z.boolean().optional(),
    noOfInstallment: numberish,
    installmentInterval: str(20),
    stages: z.array(stageLine).max(120).nullable().optional(),
});

const idParam = { params: z.object({ id }) };

module.exports = {
    create: { body: feeBody },
    update: { ...idParam, body: feeBody },
    setActive: { ...idParam, body: z.object({ isActive: z.boolean().optional() }) },
};
