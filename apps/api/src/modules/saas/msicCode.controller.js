const MsicCode = require('./msicCode.model');
const { DEFAULT_MSIC_CODES } = require('./msicCode-defaults');

// LHDN publishes the canonical MSIC sub-category list as JSON on the MyInvois SDK
// site. Sync fetches it live; if the site is unreachable from the server, the
// bundled snapshot (msicCode-defaults.js) is used instead and the response says
// so - staleness is never silent.
const LHDN_SOURCE_URL = 'https://sdk.myinvois.hasil.gov.my/files/MSICSubCategoryCodes.json';

// Normalise an MSIC code to the stored shape: trimmed (LHDN codes are
// zero-padded 5-digit strings).
function normalizeCode(code) {
    return String(code || '').trim();
}

// Fetch and validate the published LHDN list. Returns an array of
// { code, description, categoryReference } or null when the fetch/shape fails.
// The published file carries one exact-duplicate row (16211); the by-code map
// dedupes it.
async function fetchLhdnCodes() {
    try {
        const resp = await fetch(LHDN_SOURCE_URL, { signal: AbortSignal.timeout(15000) });
        if (!resp.ok) return null;
        const list = await resp.json();
        if (!Array.isArray(list) || list.length === 0) return null;
        const byCode = new Map();
        for (const e of list) {
            const code = normalizeCode(e?.Code);
            const description = String(e?.Description || '').trim();
            if (!/^\d{5}$/.test(code) || !description) continue;
            byCode.set(code, {
                code,
                description,
                categoryReference: String(e?.['MSIC Category Reference'] || '').trim() || null,
            });
        }
        return byCode.size > 0 ? [...byCode.values()] : null;
    } catch (e) {
        return null; // unreachable / timeout / bad JSON -> caller falls back
    }
}

// POST /api/admin/msic-codes/sync
// Upsert the LHDN list (live fetch, bundled fallback). Idempotent; preserves each
// existing row's isActive flag (only description/categoryReference/syncedAt are
// refreshed), so re-running only adds new codes and refreshes wording.
exports.syncMsicCodes = async (req, res) => {
    try {
        let source = 'lhdn';
        let list = await fetchLhdnCodes();
        if (!list) {
            source = 'bundled';
            list = DEFAULT_MSIC_CODES;
        }

        const now = new Date();
        const records = list.map((c) => ({
            code: normalizeCode(c.code),
            description: String(c.description).trim(),
            categoryReference: c.categoryReference || null,
            syncedAt: now,
        }));

        // isActive is intentionally NOT in updateOnDuplicate, so existing rows keep
        // their enabled/disabled state and new rows default to active.
        await MsicCode.bulkCreate(records, {
            updateOnDuplicate: ['description', 'categoryReference', 'syncedAt', 'updatedAt'],
        });

        res.status(200).json({
            message: source === 'lhdn'
                ? `Synced ${records.length} MSIC codes from LHDN.`
                : `LHDN site unreachable - loaded ${records.length} MSIC codes from the bundled copy.`,
            total: records.length,
            source,
            syncedAt: now,
        });
    } catch (error) {
        console.error('Error syncing MSIC codes:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/admin/msic-codes  (System Admin maintenance - every code)
exports.listAllMsicCodes = async (req, res) => {
    try {
        const codes = await MsicCode.findAll({ order: [['code', 'ASC']] });
        res.status(200).json(codes);
    } catch (error) {
        console.error('Error listing MSIC codes:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/admin/msic-codes   Body: { code, description, categoryReference? }
// Manual add - for a new LHDN code published before the next sync.
exports.createMsicCode = async (req, res) => {
    try {
        const code = normalizeCode(req.body.code);
        const description = String(req.body.description || '').trim();
        const categoryReference = String(req.body.categoryReference || '').trim().toUpperCase() || null;

        const existing = await MsicCode.findByPk(code);
        if (existing) return res.status(409).json({ message: `MSIC code '${code}' already exists.` });

        const msicCode = await MsicCode.create({ code, description, categoryReference });
        res.status(201).json({ message: 'MSIC code created.', msicCode });
    } catch (error) {
        console.error('Error creating MSIC code:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/admin/msic-codes/:code   Body: { description?, categoryReference?, isActive? }
exports.updateMsicCode = async (req, res) => {
    try {
        const code = normalizeCode(req.params.code);
        const msicCode = await MsicCode.findByPk(code);
        if (!msicCode) return res.status(404).json({ message: 'MSIC code not found.' });

        if (typeof req.body.description === 'string' && req.body.description.trim()) {
            msicCode.description = req.body.description.trim();
        }
        if (typeof req.body.categoryReference === 'string') {
            msicCode.categoryReference = req.body.categoryReference.trim().toUpperCase() || null;
        }
        if (typeof req.body.isActive === 'boolean') msicCode.isActive = req.body.isActive;
        await msicCode.save();

        res.status(200).json({ message: 'MSIC code updated.', msicCode });
    } catch (error) {
        console.error('Error updating MSIC code:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/admin/msic-codes/:code
// For removing a mistaken manual add; a code in LHDN's list reappears on the next sync.
exports.deleteMsicCode = async (req, res) => {
    try {
        const code = normalizeCode(req.params.code);
        const msicCode = await MsicCode.findByPk(code);
        if (!msicCode) return res.status(404).json({ message: 'MSIC code not found.' });

        await msicCode.destroy();
        res.status(200).json({ message: 'MSIC code deleted.' });
    } catch (error) {
        console.error('Error deleting MSIC code:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/msic-codes  (any authenticated user - active codes for pickers)
exports.listActiveMsicCodes = async (req, res) => {
    try {
        const codes = await MsicCode.findAll({
            where: { isActive: true },
            attributes: ['code', 'description', 'categoryReference'],
            order: [['code', 'ASC']],
        });
        res.status(200).json(codes);
    } catch (error) {
        console.error('Error listing active MSIC codes:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
