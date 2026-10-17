// Request schemas for the golf Transaction Type master routes and their
// Pricing (rate) sub-routes (the Zod boundary seam, platform/validate.js -
// mounted 2026-10-12). The controllers keep the vocabulary checks, the
// package element / eligibility business rules, the active-default clash and
// the tax-scheme ownership check; these schemas bound SHAPE and SIZE and
// strip unknown keys, so every key normalizeBody, normalizeElements,
// normalizeEligibility and the rate controller's normalizeBody read is listed
// here - an unlisted key would be silently dropped.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// Amounts, quantities, holes and ages arrive as numbers or digit strings from the web forms.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const id = fields.uuid;

// A package element line (normalizeElements).
const elementLine = z.object({
    elementTransactionTypeId: str(64),
    quantity: numberish,
    unitAmount: numberish,
});

// A package eligibility condition (normalizeEligibility); every column optional.
const eligibilityLine = z.object({
    daysOfWeek: z.array(z.string().max(16)).max(7).nullable().optional(),
    excludePublicHolidays: z.boolean().optional(),
    startTime: str(8),
    endTime: str(8),
    holes: numberish,
    minAge: numberish,
    maxAge: numberish,
    gender: str(20),
    nationalityCode: str(20),
});

const typeBody = z.object({
    transactionType: str(100),
    chargeType: str(50),
    golferType: str(50),
    usageType: str(20),
    description: str(255),
    taxSchemeCode: str(255),
    allowPriceOverride: z.boolean().optional(),
    iconUrl: str(255),
    autoTransactionTypeId: str(64),
    packageItems: z.array(elementLine).max(100).nullable().optional(),
    eligibility: z.array(eligibilityLine).max(50).nullable().optional(),
});

// A price card (transactionTypeRate.controller normalizeBody): the 4-cell
// matrix for matrix charge types, a flat amount for the rest.
const rateBody = z.object({
    effectiveDate: str(10),
    flatAmount: numberish,
    price9Weekday: numberish,
    price18Weekday: numberish,
    price9Weekend: numberish,
    price18Weekend: numberish,
});

const idParam = { params: z.object({ id }) };
const rateParam = { params: z.object({ id, rateId: id }) };
const activeBody = z.object({ isActive: z.boolean().optional() });

module.exports = {
    create: { body: typeBody },
    update: { ...idParam, body: typeBody },
    setActive: { ...idParam, body: activeBody },
    // --- Pricing ---
    rateList: idParam,
    rateCreate: { ...idParam, body: rateBody },
    rateUpdate: { ...rateParam, body: rateBody },
    rateSetActive: { ...rateParam, body: activeBody },
    rateRemove: rateParam,
};
