const EInvoiceUnitType = require('./eInvoiceUnitType.model');
const { DEFAULT_EINVOICE_UNIT_TYPES } = require('./eInvoiceUnitType-defaults');

// LHDN publishes the canonical unit-type list as JSON on the MyInvois SDK site.
// Sync fetches it live; if the site is unreachable from the server, the bundled
// snapshot (eInvoiceUnitType-defaults.js) is used instead and the response says
// so - staleness is never silent.
const LHDN_SOURCE_URL = 'https://sdk.myinvois.hasil.gov.my/files/UnitTypes.json';

// Normalise an LHDN unit-type code to the stored shape: trimmed, uppercase
// (codes are UN/ECE Rec 20 alphanumerics, e.g. 'KGM', 'XZZ').
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
                description: String(e?.Name || '').trim(),
            }))
            .filter((e) => /^[0-9A-Z-]{1,20}$/.test(e.code) && e.description);
        return records.length > 0 ? records : null;
    } catch (e) {
        return null; // unreachable / timeout / bad JSON -> caller falls back
    }
}

// POST /api/admin/e-invoice-unit-types/sync
// Upsert the LHDN list (live fetch, bundled fallback). Idempotent; preserves each
// existing row's isActive flag (only description/syncedAt are refreshed), so
// re-running only adds new codes and refreshes wording.
exports.syncEInvoiceUnitTypes = async (req, res) => {
    try {
        let source = 'lhdn';
        let list = await fetchLhdnCodes();
        if (!list) {
            source = 'bundled';
            list = DEFAULT_EINVOICE_UNIT_TYPES;
        }

        const now = new Date();
        const records = list.map((c) => ({
            code: normalizeCode(c.code),
            description: String(c.description).trim(),
            syncedAt: now,
        }));

        // isActive is intentionally NOT in updateOnDuplicate, so existing rows keep
        // their enabled/disabled state and new rows default to active.
        await EInvoiceUnitType.bulkCreate(records, {
            updateOnDuplicate: ['description', 'syncedAt', 'updatedAt'],
        });

        res.status(200).json({
            message: source === 'lhdn'
                ? `Synced ${records.length} e-Invoice unit types from LHDN.`
                : `LHDN site unreachable - loaded ${records.length} e-Invoice unit types from the bundled copy.`,
            total: records.length,
            source,
            syncedAt: now,
        });
    } catch (error) {
        console.error('Error syncing e-Invoice unit types:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/admin/e-invoice-unit-types  (System Admin maintenance - every unit type)
exports.listAllEInvoiceUnitTypes = async (req, res) => {
    try {
        const unitTypes = await EInvoiceUnitType.findAll({ order: [['code', 'ASC']] });
        res.status(200).json(unitTypes);
    } catch (error) {
        console.error('Error listing e-Invoice unit types:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/admin/e-invoice-unit-types   Body: { code, description }
// Manual add - for a new LHDN code published before the next sync.
exports.createEInvoiceUnitType = async (req, res) => {
    try {
        const code = normalizeCode(req.body.code);
        const description = String(req.body.description || '').trim();

        const existing = await EInvoiceUnitType.findByPk(code);
        if (existing) return res.status(409).json({ message: `e-Invoice unit type '${code}' already exists.` });

        const eInvoiceUnitType = await EInvoiceUnitType.create({ code, description });
        res.status(201).json({ message: 'e-Invoice unit type created.', eInvoiceUnitType });
    } catch (error) {
        console.error('Error creating e-Invoice unit type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/admin/e-invoice-unit-types/:code   Body: { description?, isActive? }
exports.updateEInvoiceUnitType = async (req, res) => {
    try {
        const code = normalizeCode(req.params.code);
        const eInvoiceUnitType = await EInvoiceUnitType.findByPk(code);
        if (!eInvoiceUnitType) return res.status(404).json({ message: 'e-Invoice unit type not found.' });

        if (typeof req.body.description === 'string' && req.body.description.trim()) {
            eInvoiceUnitType.description = req.body.description.trim();
        }
        if (typeof req.body.isActive === 'boolean') eInvoiceUnitType.isActive = req.body.isActive;
        await eInvoiceUnitType.save();

        res.status(200).json({ message: 'e-Invoice unit type updated.', eInvoiceUnitType });
    } catch (error) {
        console.error('Error updating e-Invoice unit type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/admin/e-invoice-unit-types/:code
// For removing a mistaken manual add; a code in LHDN's list reappears on the next sync.
exports.deleteEInvoiceUnitType = async (req, res) => {
    try {
        const code = normalizeCode(req.params.code);
        const eInvoiceUnitType = await EInvoiceUnitType.findByPk(code);
        if (!eInvoiceUnitType) return res.status(404).json({ message: 'e-Invoice unit type not found.' });

        await eInvoiceUnitType.destroy();
        res.status(200).json({ message: 'e-Invoice unit type deleted.' });
    } catch (error) {
        console.error('Error deleting e-Invoice unit type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/e-invoice-unit-types  (any authenticated user - active unit types for pickers)
exports.listActiveEInvoiceUnitTypes = async (req, res) => {
    try {
        const unitTypes = await EInvoiceUnitType.findAll({
            where: { isActive: true },
            attributes: ['code', 'description'],
            order: [['code', 'ASC']],
        });
        res.status(200).json(unitTypes);
    } catch (error) {
        console.error('Error listing active e-Invoice unit types:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
