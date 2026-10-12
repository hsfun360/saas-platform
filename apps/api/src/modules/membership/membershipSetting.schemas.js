// Request schemas for the Club Specification routes (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12). The controller keeps its business
// validation (club type vocabulary, suffix patterns via childNumbering.js, the
// numbering config through numberingGateway -> Numbering Control); these
// schemas bound SHAPE and SIZE and strip unknown keys, so every key the
// controller or the gateway reads is listed here - an unlisted key would be
// silently dropped.

const { z } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// Counters arrive as numbers from the dialog and as digit strings in the
// preview query.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();

// The numbering config the Configure dialog saves and the preview renders.
// `currentNumber` is read by numberingGateway.previewScheme only (the saved
// counter is untouchable, the preview just continues from it); `typeCode`
// fills the {TYPE} token.
const numberingDraft = {
    prefix: str(50),
    format: str(100),
    seqPadLength: numberish,
    startingNumber: numberish,
    resetRule: str(20),
};

module.exports = {
    get: { query: z.object({}) },
    updateSettings: {
        body: z.object({
            clubType: str(20),
            isCommittee: z.boolean().optional(),
            creditFacilityEnabled: z.boolean().optional(),
            nomineeNoSuffix: str(20),
            dependentNoSuffix: str(20),
            salesAgencyEnabled: z.boolean().optional(),
            salesExternalEnabled: z.boolean().optional(),
            salesInternalEnabled: z.boolean().optional(),
            isMembershipAutoNumber: z.boolean().optional(),
        }),
    },
    updateNumbering: { body: z.object(numberingDraft) },
    previewNumbering: { query: z.object({ ...numberingDraft, currentNumber: numberish, typeCode: str(20) }) },
};
