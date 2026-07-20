// Numbering Control - scheme config service (Control-Plane owned).
//
// One place for the validation + persistence rules of a scheme's CONFIG
// fields, shared by the two maintenance surfaces:
//   - the Tenant-Admin screen (numberingScheme.controller.js), and
//   - product settings screens reaching in through platform/numberingGateway.js
//     (Membership's Club Specification today).
// The running counter is never touched here - only numberingGenerator.issue
// advances it, under its row lock.

const NumberingScheme = require('./numberingScheme.model');
const { previewNext } = require('./numberingGenerator');
const {
    NUMBERING_MODE_KEYS,
    RESET_RULE_KEYS,
    NUMBERING_PURPOSE_KEYS,
} = require('./numberingScheme.constants');

// Validate + normalise the editable config fields. Only fields present on the
// body are returned, so callers can PATCH a subset. Returns { value } | { error }.
function normalizeConfig(body) {
    const value = {};

    if (body.mode !== undefined) {
        const mode = String(body.mode || '').trim();
        if (!NUMBERING_MODE_KEYS.includes(mode)) return { error: 'Invalid mode.' };
        value.mode = mode;
    }
    if (body.prefix !== undefined) {
        value.prefix = typeof body.prefix === 'string' ? body.prefix.trim() || null : null;
    }
    if (body.format !== undefined) {
        value.format = typeof body.format === 'string' && body.format.trim() ? body.format.trim() : '{PREFIX}{SEQ}';
    }
    if (body.seqPadLength !== undefined) {
        const n = Number(body.seqPadLength);
        if (!Number.isInteger(n) || n < 0 || n > 12) return { error: 'Sequence padding must be a whole number from 0 to 12.' };
        value.seqPadLength = n;
    }
    if (body.startingNumber !== undefined) {
        const n = Number(body.startingNumber);
        if (!Number.isInteger(n) || n < 1) return { error: 'Starting number must be a whole number of at least 1.' };
        value.startingNumber = n;
    }
    if (body.resetRule !== undefined) {
        const resetRule = String(body.resetRule || '').trim();
        if (!RESET_RULE_KEYS.includes(resetRule)) return { error: 'Invalid reset rule.' };
        value.resetRule = resetRule;
    }
    if (typeof body.isActive === 'boolean') value.isActive = body.isActive;

    return { value };
}

async function getScheme(companyId, purpose) {
    return NumberingScheme.findOne({ where: { companyId, purpose } });
}

// Create-or-update the scheme's config for (company, purpose). `config` must
// already be normalizeConfig output. Returns the row.
async function upsertScheme(companyId, purpose, config) {
    if (!NUMBERING_PURPOSE_KEYS.includes(purpose)) throw new Error(`Unknown numbering purpose '${purpose}'`);
    const existing = await getScheme(companyId, purpose);
    if (existing) {
        Object.assign(existing, config);
        await existing.save();
        return existing;
    }
    return NumberingScheme.create({ companyId, purpose, ...config });
}

module.exports = { normalizeConfig, getScheme, upsertScheme, previewNext };
