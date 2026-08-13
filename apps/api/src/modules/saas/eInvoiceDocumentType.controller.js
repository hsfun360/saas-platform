const EInvoiceDocumentType = require('./eInvoiceDocumentType.model');
const { DEFAULT_EINVOICE_DOCUMENT_TYPES } = require('./eInvoiceDocumentType-defaults');

// LHDN publishes the canonical document-type list as JSON on the MyInvois SDK site.
// Sync fetches it live; if the site is unreachable from the server, the bundled
// snapshot (eInvoiceDocumentType-defaults.js) is used instead and the response says
// so - staleness is never silent.
const LHDN_SOURCE_URL = 'https://sdk.myinvois.hasil.gov.my/files/EInvoiceTypes.json';

// Normalise an LHDN document-type code to the stored shape: trimmed, uppercase
// (codes are '01'..'04' and '11'..'14').
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
                description: String(e?.Description || '').trim(),
            }))
            .filter((e) => /^[0-9A-Z-]{1,20}$/.test(e.code) && e.description);
        return records.length > 0 ? records : null;
    } catch (e) {
        return null; // unreachable / timeout / bad JSON -> caller falls back
    }
}

// POST /api/admin/e-invoice-document-types/sync
// Upsert the LHDN list (live fetch, bundled fallback). Idempotent; preserves each
// existing row's isActive flag (only description/syncedAt are refreshed), so
// re-running only adds new codes and refreshes wording.
exports.syncEInvoiceDocumentTypes = async (req, res) => {
    try {
        let source = 'lhdn';
        let list = await fetchLhdnCodes();
        if (!list) {
            source = 'bundled';
            list = DEFAULT_EINVOICE_DOCUMENT_TYPES;
        }

        const now = new Date();
        const records = list.map((c) => ({
            code: normalizeCode(c.code),
            description: String(c.description).trim(),
            syncedAt: now,
        }));

        // isActive is intentionally NOT in updateOnDuplicate, so existing rows keep
        // their enabled/disabled state and new rows default to active.
        await EInvoiceDocumentType.bulkCreate(records, {
            updateOnDuplicate: ['description', 'syncedAt', 'updatedAt'],
        });

        res.status(200).json({
            message: source === 'lhdn'
                ? `Synced ${records.length} e-Invoice document types from LHDN.`
                : `LHDN site unreachable - loaded ${records.length} e-Invoice document types from the bundled copy.`,
            total: records.length,
            source,
            syncedAt: now,
        });
    } catch (error) {
        console.error('Error syncing e-Invoice document types:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/admin/e-invoice-document-types  (System Admin maintenance - every document type)
exports.listAllEInvoiceDocumentTypes = async (req, res) => {
    try {
        const documentTypes = await EInvoiceDocumentType.findAll({ order: [['code', 'ASC']] });
        res.status(200).json(documentTypes);
    } catch (error) {
        console.error('Error listing e-Invoice document types:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/admin/e-invoice-document-types   Body: { code, description }
// Manual add - for a new LHDN code published before the next sync.
exports.createEInvoiceDocumentType = async (req, res) => {
    try {
        const code = normalizeCode(req.body.code);
        const description = String(req.body.description || '').trim();

        const existing = await EInvoiceDocumentType.findByPk(code);
        if (existing) return res.status(409).json({ message: `e-Invoice document type '${code}' already exists.` });

        const eInvoiceDocumentType = await EInvoiceDocumentType.create({ code, description });
        res.status(201).json({ message: 'e-Invoice document type created.', eInvoiceDocumentType });
    } catch (error) {
        console.error('Error creating e-Invoice document type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/admin/e-invoice-document-types/:code   Body: { description?, isActive? }
exports.updateEInvoiceDocumentType = async (req, res) => {
    try {
        const code = normalizeCode(req.params.code);
        const eInvoiceDocumentType = await EInvoiceDocumentType.findByPk(code);
        if (!eInvoiceDocumentType) return res.status(404).json({ message: 'e-Invoice document type not found.' });

        if (typeof req.body.description === 'string' && req.body.description.trim()) {
            eInvoiceDocumentType.description = req.body.description.trim();
        }
        if (typeof req.body.isActive === 'boolean') eInvoiceDocumentType.isActive = req.body.isActive;
        await eInvoiceDocumentType.save();

        res.status(200).json({ message: 'e-Invoice document type updated.', eInvoiceDocumentType });
    } catch (error) {
        console.error('Error updating e-Invoice document type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/admin/e-invoice-document-types/:code
// For removing a mistaken manual add; a code in LHDN's list reappears on the next sync.
exports.deleteEInvoiceDocumentType = async (req, res) => {
    try {
        const code = normalizeCode(req.params.code);
        const eInvoiceDocumentType = await EInvoiceDocumentType.findByPk(code);
        if (!eInvoiceDocumentType) return res.status(404).json({ message: 'e-Invoice document type not found.' });

        await eInvoiceDocumentType.destroy();
        res.status(200).json({ message: 'e-Invoice document type deleted.' });
    } catch (error) {
        console.error('Error deleting e-Invoice document type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/e-invoice-document-types  (any authenticated user - active document types for pickers)
exports.listActiveEInvoiceDocumentTypes = async (req, res) => {
    try {
        const documentTypes = await EInvoiceDocumentType.findAll({
            where: { isActive: true },
            attributes: ['code', 'description'],
            order: [['code', 'ASC']],
        });
        res.status(200).json(documentTypes);
    } catch (error) {
        console.error('Error listing active e-Invoice document types:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
