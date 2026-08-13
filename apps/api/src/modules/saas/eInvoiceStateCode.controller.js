const EInvoiceStateCode = require('./eInvoiceStateCode.model');
const { DEFAULT_EINVOICE_STATE_CODES } = require('./eInvoiceStateCode-defaults');

// LHDN publishes the canonical state-code list as JSON on the MyInvois SDK site.
// Sync fetches it live; if the site is unreachable from the server, the bundled
// snapshot (eInvoiceStateCode-defaults.js) is used instead and the response says
// so - staleness is never silent.
const LHDN_SOURCE_URL = 'https://sdk.myinvois.hasil.gov.my/files/StateCodes.json';

// Normalise an LHDN state-code code to the stored shape: trimmed, uppercase
// (codes are '01'..'17').
function normalizeCode(code) {
    return String(code || '').trim().toUpperCase();
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
                description: String(e?.State || '').trim(),
            }))
            .filter((e) => /^[0-9A-Z-]{1,20}$/.test(e.code) && e.description);
        return records.length > 0 ? records : null;
    } catch (e) {
        return null; // unreachable / timeout / bad JSON -> caller falls back
    }
}

// POST /api/admin/e-invoice-state-codes/sync
// Upsert the LHDN list (live fetch, bundled fallback). Idempotent; preserves each
// existing row's isActive flag (only description/syncedAt are refreshed), so
// re-running only adds new codes and refreshes wording.
exports.syncEInvoiceStateCodes = async (req, res) => {
    try {
        let source = 'lhdn';
        let list = await fetchLhdnCodes();
        if (!list) {
            source = 'bundled';
            list = DEFAULT_EINVOICE_STATE_CODES;
        }

        const now = new Date();
        const records = list.map((c) => ({
            code: normalizeCode(c.code),
            description: String(c.description).trim(),
            syncedAt: now,
        }));

        // isActive is intentionally NOT in updateOnDuplicate, so existing rows keep
        // their enabled/disabled state and new rows default to active.
        await EInvoiceStateCode.bulkCreate(records, {
            updateOnDuplicate: ['description', 'syncedAt', 'updatedAt'],
        });

        res.status(200).json({
            message: source === 'lhdn'
                ? `Synced ${records.length} e-Invoice state codes from LHDN.`
                : `LHDN site unreachable - loaded ${records.length} e-Invoice state codes from the bundled copy.`,
            total: records.length,
            source,
            syncedAt: now,
        });
    } catch (error) {
        console.error('Error syncing e-Invoice state codes:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/admin/e-invoice-state-codes  (System Admin maintenance - every state code)
exports.listAllEInvoiceStateCodes = async (req, res) => {
    try {
        const stateCodes = await EInvoiceStateCode.findAll({ order: [['code', 'ASC']] });
        res.status(200).json(stateCodes);
    } catch (error) {
        console.error('Error listing e-Invoice state codes:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/admin/e-invoice-state-codes   Body: { code, description }
// Manual add - for a new LHDN code published before the next sync.
exports.createEInvoiceStateCode = async (req, res) => {
    try {
        const code = normalizeCode(req.body.code);
        const description = String(req.body.description || '').trim();

        const existing = await EInvoiceStateCode.findByPk(code);
        if (existing) return res.status(409).json({ message: `e-Invoice state code '${code}' already exists.` });

        const eInvoiceStateCode = await EInvoiceStateCode.create({ code, description });
        res.status(201).json({ message: 'e-Invoice state code created.', eInvoiceStateCode });
    } catch (error) {
        console.error('Error creating e-Invoice state code:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/admin/e-invoice-state-codes/:code   Body: { description?, isActive? }
exports.updateEInvoiceStateCode = async (req, res) => {
    try {
        const code = normalizeCode(req.params.code);
        const eInvoiceStateCode = await EInvoiceStateCode.findByPk(code);
        if (!eInvoiceStateCode) return res.status(404).json({ message: 'e-Invoice state code not found.' });

        if (typeof req.body.description === 'string' && req.body.description.trim()) {
            eInvoiceStateCode.description = req.body.description.trim();
        }
        if (typeof req.body.isActive === 'boolean') eInvoiceStateCode.isActive = req.body.isActive;
        await eInvoiceStateCode.save();

        res.status(200).json({ message: 'e-Invoice state code updated.', eInvoiceStateCode });
    } catch (error) {
        console.error('Error updating e-Invoice state code:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/admin/e-invoice-state-codes/:code
// For removing a mistaken manual add; a code in LHDN's list reappears on the next sync.
exports.deleteEInvoiceStateCode = async (req, res) => {
    try {
        const code = normalizeCode(req.params.code);
        const eInvoiceStateCode = await EInvoiceStateCode.findByPk(code);
        if (!eInvoiceStateCode) return res.status(404).json({ message: 'e-Invoice state code not found.' });

        await eInvoiceStateCode.destroy();
        res.status(200).json({ message: 'e-Invoice state code deleted.' });
    } catch (error) {
        console.error('Error deleting e-Invoice state code:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/e-invoice-state-codes  (any authenticated user - active state codes for pickers)
exports.listActiveEInvoiceStateCodes = async (req, res) => {
    try {
        const stateCodes = await EInvoiceStateCode.findAll({
            where: { isActive: true },
            attributes: ['code', 'description'],
            order: [['code', 'ASC']],
        });
        res.status(200).json(stateCodes);
    } catch (error) {
        console.error('Error listing active e-Invoice state codes:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
