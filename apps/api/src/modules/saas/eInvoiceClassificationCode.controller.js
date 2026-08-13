const EInvoiceClassificationCode = require('./eInvoiceClassificationCode.model');
const { DEFAULT_EINVOICE_CLASSIFICATION_CODES } = require('./eInvoiceClassificationCode-defaults');

// LHDN publishes the canonical classification-code list as JSON on the MyInvois SDK
// site. Sync fetches it live; if the site is unreachable from the server, the
// bundled snapshot (eInvoiceClassificationCode-defaults.js) is used instead and the
// response says so - staleness is never silent.
const LHDN_SOURCE_URL = 'https://sdk.myinvois.hasil.gov.my/files/EInvoiceClassificationCodes.json';

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

// POST /api/admin/e-invoice-classification-codes/sync
// Upsert the LHDN list (live fetch, bundled fallback). Idempotent; preserves each
// existing row's isActive flag (only description/syncedAt are refreshed), so
// re-running only adds new codes and refreshes wording.
exports.syncEInvoiceClassificationCodes = async (req, res) => {
    try {
        let source = 'lhdn';
        let list = await fetchLhdnCodes();
        if (!list) {
            source = 'bundled';
            list = DEFAULT_EINVOICE_CLASSIFICATION_CODES;
        }

        const now = new Date();
        const records = list.map((c) => ({
            code: normalizeCode(c.code),
            description: String(c.description).trim(),
            syncedAt: now,
        }));

        // isActive is intentionally NOT in updateOnDuplicate, so existing rows keep
        // their enabled/disabled state and new rows default to active.
        await EInvoiceClassificationCode.bulkCreate(records, {
            updateOnDuplicate: ['description', 'syncedAt', 'updatedAt'],
        });

        res.status(200).json({
            message: source === 'lhdn'
                ? `Synced ${records.length} e-Invoice classification codes from LHDN.`
                : `LHDN site unreachable - loaded ${records.length} e-Invoice classification codes from the bundled copy.`,
            total: records.length,
            source,
            syncedAt: now,
        });
    } catch (error) {
        console.error('Error syncing e-Invoice classification codes:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/admin/e-invoice-classification-codes  (System Admin maintenance - every code)
exports.listAllEInvoiceClassificationCodes = async (req, res) => {
    try {
        const codes = await EInvoiceClassificationCode.findAll({ order: [['code', 'ASC']] });
        res.status(200).json(codes);
    } catch (error) {
        console.error('Error listing e-Invoice classification codes:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/admin/e-invoice-classification-codes   Body: { code, description }
// Manual add - for a new LHDN code published before the next sync.
exports.createEInvoiceClassificationCode = async (req, res) => {
    try {
        const code = normalizeCode(req.body.code);
        const description = String(req.body.description || '').trim();

        const existing = await EInvoiceClassificationCode.findByPk(code);
        if (existing) return res.status(409).json({ message: `e-Invoice classification code '${code}' already exists.` });

        const eInvoiceClassificationCode = await EInvoiceClassificationCode.create({ code, description });
        res.status(201).json({ message: 'e-Invoice classification code created.', eInvoiceClassificationCode });
    } catch (error) {
        console.error('Error creating e-Invoice classification code:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/admin/e-invoice-classification-codes/:code   Body: { description?, isActive? }
exports.updateEInvoiceClassificationCode = async (req, res) => {
    try {
        const code = normalizeCode(req.params.code);
        const eInvoiceClassificationCode = await EInvoiceClassificationCode.findByPk(code);
        if (!eInvoiceClassificationCode) return res.status(404).json({ message: 'e-Invoice classification code not found.' });

        if (typeof req.body.description === 'string' && req.body.description.trim()) {
            eInvoiceClassificationCode.description = req.body.description.trim();
        }
        if (typeof req.body.isActive === 'boolean') eInvoiceClassificationCode.isActive = req.body.isActive;
        await eInvoiceClassificationCode.save();

        res.status(200).json({ message: 'e-Invoice classification code updated.', eInvoiceClassificationCode });
    } catch (error) {
        console.error('Error updating e-Invoice classification code:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/admin/e-invoice-classification-codes/:code
// For removing a mistaken manual add; a code in LHDN's list reappears on the next sync.
exports.deleteEInvoiceClassificationCode = async (req, res) => {
    try {
        const code = normalizeCode(req.params.code);
        const eInvoiceClassificationCode = await EInvoiceClassificationCode.findByPk(code);
        if (!eInvoiceClassificationCode) return res.status(404).json({ message: 'e-Invoice classification code not found.' });

        await eInvoiceClassificationCode.destroy();
        res.status(200).json({ message: 'e-Invoice classification code deleted.' });
    } catch (error) {
        console.error('Error deleting e-Invoice classification code:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/e-invoice-classification-codes  (any authenticated user - active codes for pickers)
exports.listActiveEInvoiceClassificationCodes = async (req, res) => {
    try {
        const codes = await EInvoiceClassificationCode.findAll({
            where: { isActive: true },
            attributes: ['code', 'description'],
            order: [['code', 'ASC']],
        });
        res.status(200).json(codes);
    } catch (error) {
        console.error('Error listing active e-Invoice classification codes:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
