const ClassificationCode = require('./classificationCode.model');
const { DEFAULT_CLASSIFICATION_CODES } = require('./classificationCode-defaults');

// LHDN publishes the canonical classification-code list as JSON on the MyInvois SDK
// site. Sync fetches it live; if the site is unreachable from the server, the
// bundled snapshot (classificationCode-defaults.js) is used instead and the
// response says so - staleness is never silent.
const LHDN_SOURCE_URL = 'https://sdk.myinvois.hasil.gov.my/files/ClassificationCodes.json';

// Normalise an LHDN code to the stored shape: trimmed (codes are zero-padded digits).
function normalizeCode(code) {
    return String(code || '').trim();
}

// Fetch and validate the published LHDN list. Returns an array of
// { code, description } or null when the fetch/shape fails.
async function fetchLhdnCodes() {
    try {
        const resp = await fetch(LHDN_SOURCE_URL, { signal: AbortSignal.timeout(15000) });
        if (!resp.ok) return null;
        const list = await resp.json();
        if (!Array.isArray(list) || list.length === 0) return null;
        const records = list
            .map((e) => ({
                code: normalizeCode(e?.Code),
                description: String(e?.Description || '').trim(),
            }))
            .filter((e) => /^\d{3}$/.test(e.code) && e.description);
        return records.length > 0 ? records : null;
    } catch (e) {
        return null; // unreachable / timeout / bad JSON -> caller falls back
    }
}

// POST /api/admin/classification-codes/sync
// Upsert the LHDN list (live fetch, bundled fallback). Idempotent; preserves each
// existing row's isActive flag (only description/syncedAt are refreshed), so
// re-running only adds new codes and refreshes wording.
exports.syncClassificationCodes = async (req, res) => {
    try {
        let source = 'lhdn';
        let list = await fetchLhdnCodes();
        if (!list) {
            source = 'bundled';
            list = DEFAULT_CLASSIFICATION_CODES;
        }

        const now = new Date();
        const records = list.map((c) => ({
            code: normalizeCode(c.code),
            description: String(c.description).trim(),
            syncedAt: now,
        }));

        // isActive is intentionally NOT in updateOnDuplicate, so existing rows keep
        // their enabled/disabled state and new rows default to active.
        await ClassificationCode.bulkCreate(records, {
            updateOnDuplicate: ['description', 'syncedAt', 'updatedAt'],
        });

        res.status(200).json({
            message: source === 'lhdn'
                ? `Synced ${records.length} classification codes from LHDN.`
                : `LHDN site unreachable - loaded ${records.length} classification codes from the bundled copy.`,
            total: records.length,
            source,
            syncedAt: now,
        });
    } catch (error) {
        console.error('Error syncing classification codes:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/admin/classification-codes  (System Admin maintenance - every code)
exports.listAllClassificationCodes = async (req, res) => {
    try {
        const codes = await ClassificationCode.findAll({ order: [['code', 'ASC']] });
        res.status(200).json(codes);
    } catch (error) {
        console.error('Error listing classification codes:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/admin/classification-codes   Body: { code, description }
// Manual add - for a new LHDN code published before the next sync.
exports.createClassificationCode = async (req, res) => {
    try {
        const code = normalizeCode(req.body.code);
        const description = String(req.body.description || '').trim();

        const existing = await ClassificationCode.findByPk(code);
        if (existing) return res.status(409).json({ message: `Classification code '${code}' already exists.` });

        const classificationCode = await ClassificationCode.create({ code, description });
        res.status(201).json({ message: 'Classification code created.', classificationCode });
    } catch (error) {
        console.error('Error creating classification code:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/admin/classification-codes/:code   Body: { description?, isActive? }
exports.updateClassificationCode = async (req, res) => {
    try {
        const code = normalizeCode(req.params.code);
        const classificationCode = await ClassificationCode.findByPk(code);
        if (!classificationCode) return res.status(404).json({ message: 'Classification code not found.' });

        if (typeof req.body.description === 'string' && req.body.description.trim()) {
            classificationCode.description = req.body.description.trim();
        }
        if (typeof req.body.isActive === 'boolean') classificationCode.isActive = req.body.isActive;
        await classificationCode.save();

        res.status(200).json({ message: 'Classification code updated.', classificationCode });
    } catch (error) {
        console.error('Error updating classification code:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/admin/classification-codes/:code
// For removing a mistaken manual add; a code in LHDN's list reappears on the next sync.
exports.deleteClassificationCode = async (req, res) => {
    try {
        const code = normalizeCode(req.params.code);
        const classificationCode = await ClassificationCode.findByPk(code);
        if (!classificationCode) return res.status(404).json({ message: 'Classification code not found.' });

        await classificationCode.destroy();
        res.status(200).json({ message: 'Classification code deleted.' });
    } catch (error) {
        console.error('Error deleting classification code:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/classification-codes  (any authenticated user - active codes for pickers)
exports.listActiveClassificationCodes = async (req, res) => {
    try {
        const codes = await ClassificationCode.findAll({
            where: { isActive: true },
            attributes: ['code', 'description'],
            order: [['code', 'ASC']],
        });
        res.status(200).json(codes);
    } catch (error) {
        console.error('Error listing active classification codes:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
