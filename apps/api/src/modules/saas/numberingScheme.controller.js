const NumberingScheme = require('./numberingScheme.model');
const { previewNext } = require('./numberingGenerator');
const {
    NUMBERING_MODES,
    RESET_RULES,
    NUMBERING_PURPOSES,
    FORMAT_TOKENS,
    NUMBERING_MODE_KEYS,
    RESET_RULE_KEYS,
    NUMBERING_PURPOSE_KEYS,
} = require('./numberingScheme.constants');

// Numbering Control is per-company config; maintained by the Tenant Admin for
// their ACTIVE company (companyId from the JWT; requireTenant guarantees one).
function companyIdOf(req) {
    return req.user && req.user.companyId ? req.user.companyId : null;
}

function toDto(row) {
    const dto = {
        id: row.id,
        companyId: row.companyId,
        purpose: row.purpose,
        mode: row.mode,
        prefix: row.prefix,
        format: row.format,
        seqPadLength: row.seqPadLength,
        startingNumber: row.startingNumber,
        currentNumber: row.currentNumber,
        resetRule: row.resetRule,
        currentPeriod: row.currentPeriod,
        isActive: row.isActive,
    };
    // A sample of the next number, so the list is self-explanatory (auto only).
    dto.nextPreview = row.mode === 'auto' ? previewNext(row).number : null;
    return dto;
}

// Validate + normalise the config fields shared by create/update. Returns
// { value } or { error }.
function normalizeBody(body, { forCreate } = {}) {
    const value = {};

    if (forCreate) {
        const purpose = String(body.purpose || '').trim();
        if (!NUMBERING_PURPOSE_KEYS.includes(purpose)) return { error: 'Invalid numbering purpose.' };
        value.purpose = purpose;
    }

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

// GET /auth/company/numbering-schemes/meta
exports.getMeta = async (req, res) => {
    res.status(200).json({
        modes: NUMBERING_MODES,
        resetRules: RESET_RULES,
        purposes: NUMBERING_PURPOSES,
        tokens: FORMAT_TOKENS,
    });
};

// GET /auth/company/numbering-schemes - the active company's schemes.
exports.listSchemes = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const rows = await NumberingScheme.findAll({ where: { companyId }, order: [['purpose', 'ASC']] });
        res.status(200).json(rows.map(toDto));
    } catch (error) {
        console.error('Error listing numbering schemes:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /auth/company/numbering-schemes
exports.createScheme = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const parsed = normalizeBody(req.body, { forCreate: true });
        if (parsed.error) return res.status(400).json({ message: parsed.error });

        const existing = await NumberingScheme.findOne({ where: { companyId, purpose: parsed.value.purpose } });
        if (existing) return res.status(409).json({ message: 'A numbering scheme for this purpose already exists.' });

        const row = await NumberingScheme.create({ companyId, ...parsed.value });
        res.status(201).json({ message: 'Numbering scheme created.', scheme: toDto(row) });
    } catch (error) {
        console.error('Error creating numbering scheme:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /auth/company/numbering-schemes/:id - config fields (not the counter/purpose).
exports.updateScheme = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const row = await NumberingScheme.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Numbering scheme not found.' });

        const parsed = normalizeBody(req.body, { forCreate: false });
        if (parsed.error) return res.status(400).json({ message: parsed.error });

        Object.assign(row, parsed.value);
        await row.save();
        res.status(200).json({ message: 'Numbering scheme updated.', scheme: toDto(row) });
    } catch (error) {
        console.error('Error updating numbering scheme:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /auth/company/numbering-schemes/preview  Body: draft config (+ typeCode?)
// Renders the next number for an unsaved draft, so the screen can show the shape.
exports.previewScheme = async (req, res) => {
    try {
        const draft = {
            prefix: typeof req.body.prefix === 'string' ? req.body.prefix : '',
            format: typeof req.body.format === 'string' && req.body.format.trim() ? req.body.format : '{PREFIX}{SEQ}',
            seqPadLength: Number.isInteger(Number(req.body.seqPadLength)) ? Number(req.body.seqPadLength) : 5,
            startingNumber: Number.isInteger(Number(req.body.startingNumber)) ? Number(req.body.startingNumber) : 1,
            currentNumber: Number.isInteger(Number(req.body.currentNumber)) ? Number(req.body.currentNumber) : 0,
            resetRule: RESET_RULE_KEYS.includes(req.body.resetRule) ? req.body.resetRule : 'never',
            currentPeriod: null,
        };
        const typeCode = typeof req.body.typeCode === 'string' ? req.body.typeCode : undefined;
        res.status(200).json(previewNext(draft, { typeCode }));
    } catch (error) {
        console.error('Error previewing numbering scheme:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
