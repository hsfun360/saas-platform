// Request schemas for the Tax routes (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12). The controllers keep every
// business check (country ownership, scheme code uniqueness, the ie flag and
// tax class vocabularies, parseRate's numeric ranges and date format, the
// claimable rule per class, template selection); these schemas bound SHAPE
// and SIZE and strip unknown keys, so every key the controllers and their
// helpers (parseRate, loadDefaults' selections loop, setAdoption's override
// map) read is listed here - an unlisted key would be silently dropped.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// Rates, priorities and percentages arrive as numbers or digit strings from the web forms.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const bool = z.boolean().optional();
const id = fields.uuid;

// One effective-dated rate line (parseRate). Every key stays optional so the
// parser's own "Tax code is required for each rate line." style messages fire.
const rateLine = {
    taxCode: str(50),
    taxRate: numberish,
    taxType: str(20),
    effectiveFrom: str(10),
    taxPriority: numberish,
    isClaimable: bool,
    claimPercentage: numberish,
    glAccountCode: str(50),
};

// The scheme header the subscriber's catalog screen posts.
const schemeHeader = {
    taxSchemeCode: str(50),
    name: str(255),
    description: str(255),
    ieFlag: str(10),
    taxClass: str(20),
    isActive: bool,
};

const idParam = { params: z.object({ id }) };
const countryQuery = { query: z.object({ countryCode: str(2) }) };

module.exports = {
    id: idParam,
    // Listing + template lookup both take the optional country filter.
    listSchemes: countryQuery,
    defaultTemplates: countryQuery,
    // Copy-on-adopt of the platform templates: [{ countryCode, taxSchemeCode }].
    loadDefaults: {
        body: z.object({
            selections: z.array(z.object({ countryCode: str(2), taxSchemeCode: str(50) })).max(200).nullable().optional(),
        }),
    },
    createScheme: {
        body: z.object({ ...schemeHeader, countryCode: str(2), rates: z.array(z.object(rateLine)).max(100).nullable().optional() }),
    },
    updateScheme: { ...idParam, body: z.object(schemeHeader) },
    addRate: { ...idParam, body: z.object(rateLine) },
    updateRate: { ...idParam, body: z.object({ ...rateLine, isActive: bool }) },
    // Per-company adoption: enable flag + { [taxCode]: glAccountCode | null }.
    setAdoption: {
        params: z.object({ taxSchemeId: id }),
        body: z.object({
            isEnabled: bool,
            glOverrides: z.record(z.string().max(50), z.string().max(50).nullable()).nullable().optional(),
        }),
    },
};
