const EInvoicePaymentMethod = require('./eInvoicePaymentMethod.model');
const { DEFAULT_EINVOICE_PAYMENT_METHODS } = require('./eInvoicePaymentMethod-defaults');

// LHDN publishes the canonical payment-method list as JSON on the MyInvois SDK site.
// Sync fetches it live; if the site is unreachable from the server, the bundled
// snapshot (eInvoicePaymentMethod-defaults.js) is used instead and the response says
// so - staleness is never silent.
const LHDN_SOURCE_URL = 'https://sdk.myinvois.hasil.gov.my/files/PaymentMethods.json';

// Normalise an LHDN payment-method code to the stored shape: trimmed, uppercase
// (codes are '01'..'08').
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
                description: String(e?.['Payment Method'] || '').trim(),
            }))
            .filter((e) => /^[0-9A-Z-]{1,20}$/.test(e.code) && e.description);
        return records.length > 0 ? records : null;
    } catch (e) {
        return null; // unreachable / timeout / bad JSON -> caller falls back
    }
}

// POST /api/admin/e-invoice-payment-methods/sync
// Upsert the LHDN list (live fetch, bundled fallback). Idempotent; preserves each
// existing row's isActive flag (only description/syncedAt are refreshed), so
// re-running only adds new codes and refreshes wording.
exports.syncEInvoicePaymentMethods = async (req, res) => {
    try {
        let source = 'lhdn';
        let list = await fetchLhdnCodes();
        if (!list) {
            source = 'bundled';
            list = DEFAULT_EINVOICE_PAYMENT_METHODS;
        }

        const now = new Date();
        const records = list.map((c) => ({
            code: normalizeCode(c.code),
            description: String(c.description).trim(),
            syncedAt: now,
        }));

        // isActive is intentionally NOT in updateOnDuplicate, so existing rows keep
        // their enabled/disabled state and new rows default to active.
        await EInvoicePaymentMethod.bulkCreate(records, {
            updateOnDuplicate: ['description', 'syncedAt', 'updatedAt'],
        });

        res.status(200).json({
            message: source === 'lhdn'
                ? `Synced ${records.length} e-Invoice payment methods from LHDN.`
                : `LHDN site unreachable - loaded ${records.length} e-Invoice payment methods from the bundled copy.`,
            total: records.length,
            source,
            syncedAt: now,
        });
    } catch (error) {
        console.error('Error syncing e-Invoice payment methods:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/admin/e-invoice-payment-methods  (System Admin maintenance - every payment method)
exports.listAllEInvoicePaymentMethods = async (req, res) => {
    try {
        const paymentMethods = await EInvoicePaymentMethod.findAll({ order: [['code', 'ASC']] });
        res.status(200).json(paymentMethods);
    } catch (error) {
        console.error('Error listing e-Invoice payment methods:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/admin/e-invoice-payment-methods   Body: { code, description }
// Manual add - for a new LHDN code published before the next sync.
exports.createEInvoicePaymentMethod = async (req, res) => {
    try {
        const code = normalizeCode(req.body.code);
        const description = String(req.body.description || '').trim();

        const existing = await EInvoicePaymentMethod.findByPk(code);
        if (existing) return res.status(409).json({ message: `e-Invoice payment method '${code}' already exists.` });

        const eInvoicePaymentMethod = await EInvoicePaymentMethod.create({ code, description });
        res.status(201).json({ message: 'e-Invoice payment method created.', eInvoicePaymentMethod });
    } catch (error) {
        console.error('Error creating e-Invoice payment method:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/admin/e-invoice-payment-methods/:code   Body: { description?, isActive? }
exports.updateEInvoicePaymentMethod = async (req, res) => {
    try {
        const code = normalizeCode(req.params.code);
        const eInvoicePaymentMethod = await EInvoicePaymentMethod.findByPk(code);
        if (!eInvoicePaymentMethod) return res.status(404).json({ message: 'e-Invoice payment method not found.' });

        if (typeof req.body.description === 'string' && req.body.description.trim()) {
            eInvoicePaymentMethod.description = req.body.description.trim();
        }
        if (typeof req.body.isActive === 'boolean') eInvoicePaymentMethod.isActive = req.body.isActive;
        await eInvoicePaymentMethod.save();

        res.status(200).json({ message: 'e-Invoice payment method updated.', eInvoicePaymentMethod });
    } catch (error) {
        console.error('Error updating e-Invoice payment method:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/admin/e-invoice-payment-methods/:code
// For removing a mistaken manual add; a code in LHDN's list reappears on the next sync.
exports.deleteEInvoicePaymentMethod = async (req, res) => {
    try {
        const code = normalizeCode(req.params.code);
        const eInvoicePaymentMethod = await EInvoicePaymentMethod.findByPk(code);
        if (!eInvoicePaymentMethod) return res.status(404).json({ message: 'e-Invoice payment method not found.' });

        await eInvoicePaymentMethod.destroy();
        res.status(200).json({ message: 'e-Invoice payment method deleted.' });
    } catch (error) {
        console.error('Error deleting e-Invoice payment method:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/e-invoice-payment-methods  (any authenticated user - active payment methods for pickers)
exports.listActiveEInvoicePaymentMethods = async (req, res) => {
    try {
        const paymentMethods = await EInvoicePaymentMethod.findAll({
            where: { isActive: true },
            attributes: ['code', 'description'],
            order: [['code', 'ASC']],
        });
        res.status(200).json(paymentMethods);
    } catch (error) {
        console.error('Error listing active e-Invoice payment methods:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
