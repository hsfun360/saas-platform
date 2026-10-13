// Request schemas for the shared Numbering Control router (the Zod boundary
// seam, platform/validate.js - mounted 2026-10-12 inside makeNumberingRouter,
// so the Membership, Golf and AR mounts all get them). The factory keeps every
// business check (normalizeConfig's mode / reset-rule vocabularies and the
// padding and starting-number ranges, the purpose list of the owning module,
// the copy-source access rule); these schemas bound SHAPE and SIZE and strip
// unknown keys, so every key the handlers and normalizeConfig read is listed
// here - an unlisted key would be silently dropped. The counter fields a
// screen may echo back on PATCH (currentNumber, currentPeriod, purpose) are
// deliberately NOT listed on the config body: the factory never reads them
// there, and stripping them is the right outcome.

const { z, fields } = require('./validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// Counts arrive as numbers or digit strings from the web forms.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
// Every NumberingScheme table shares numberingSchemeDef (UUID primary key).
const id = fields.uuid;

// The editable config fields normalizeConfig reads (presence semantics: only
// keys present on the body are applied, so a PATCH may carry a subset).
const config = {
    mode: str(20),
    prefix: str(50),
    format: str(100),
    seqPadLength: numberish,
    startingNumber: numberish,
    resetRule: str(20),
    isActive: z.boolean().optional(),
};

module.exports = {
    create: { body: z.object({ ...config, purpose: str(50) }) },
    update: { params: z.object({ id }), body: z.object(config) },
    // The unsaved-draft preview also carries the counter and the sample type
    // code for the {TYPE} token.
    preview: {
        body: z.object({
            prefix: str(50),
            format: str(100),
            seqPadLength: numberish,
            startingNumber: numberish,
            currentNumber: numberish,
            resetRule: str(20),
            typeCode: str(20),
        }),
    },
    // Copy from another company: the source is a Company id (UUID), the
    // selections are the source's scheme ids. Both stay optional so the
    // handler's own "select a company" / "select at least one" messages fire.
    copyCandidates: { params: z.object({ companyId: id }) },
    copy: {
        body: z.object({
            sourceCompanyId: id.nullable().optional(),
            ids: z.array(id).max(100).nullable().optional(),
        }),
    },
};
