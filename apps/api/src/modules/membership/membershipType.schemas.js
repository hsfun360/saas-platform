// Request schemas for the Membership Type master routes (the Zod boundary
// seam, platform/validate.js - mounted 2026-10-12). The controller keeps the
// class-conditional nulling, the integer/age checks, the cross-reference
// ownership and the AR catalog checks; these schemas bound SHAPE and SIZE and
// strip unknown keys, so every key normalizeTypeBody, normalizeFeeLines and
// normalizeStandingCharges read is listed here - an unlisted key would be
// silently dropped.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// Amounts, counts and months arrive as numbers or digit strings from the web forms.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const id = fields.uuid;

const typeBody = z.object({
    category: str(100),
    description: str(500),
    membershipClass: str(20),
    isGolfAllow: z.boolean().optional(),
    dependentGolfingAllow: z.boolean().optional(),
    votingRight: z.boolean().optional(),
    transferRight: z.boolean().optional(),
    isTermMembership: z.boolean().optional(),
    termMonths: numberish,
    childAgeFrom: numberish,
    childAgeTo: numberish,
    playTimes: numberish,
    guestQuota: numberish,
    noOfNominee: numberish,
    creditLimit: numberish,
    nomineeCategoryId: str(64),
    defaultMembershipStatusId: str(64),
    defaultMembershipFeeId: str(64),
    arDebtorType: str(50),
    conversionTargetIds: z.array(z.string().max(64)).max(100).nullable().optional(),
});

// A joining-fee line (normalizeFeeLines). Tax is single-sourced from the
// transaction type, so the line carries no tax scheme.
const feeLine = z.object({
    transactionType: str(50),
    description: str(500),
    currencyCode: str(10),
    amount: numberish,
});

// A standing-charge row (normalizeStandingCharges).
const chargeLine = z.object({
    membershipStatusId: str(64),
    transactionType: str(50),
    description: str(500),
    currencyCode: str(10),
    amount: numberish,
    frequency: str(20),
    fixedMonth: numberish,
});

const idParam = { params: z.object({ id }) };

module.exports = {
    create: { body: typeBody },
    update: { ...idParam, body: typeBody },
    setActive: { ...idParam, body: z.object({ isActive: z.boolean().optional() }) },
    additionalFees: { ...idParam, body: z.object({ additionalFees: z.array(feeLine).max(100).nullable().optional() }) },
    standingCharges: { ...idParam, body: z.object({ standingCharges: z.array(chargeLine).max(200).nullable().optional() }) },
};
