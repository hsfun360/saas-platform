const Currency = require('./currency.model');
const { DEFAULT_CURRENCIES } = require('./currency-defaults');

// Normalise an ISO 4217 code to the stored shape: trimmed, uppercase.
function normalizeCode(code) {
    return String(code || '').trim().toUpperCase();
}

// POST /api/admin/currencies/seed
// Insert the bundled ISO 4217 default set. Idempotent: upserts by code and
// preserves each existing row's isActive flag (only the ISO fields are refreshed),
// so re-running only adds new codes.
exports.seedCurrencies = async (req, res) => {
    try {
        const records = DEFAULT_CURRENCIES.map((c) => ({
            code: normalizeCode(c.code),
            numericCode: c.numericCode,
            name: c.name,
            symbol: c.symbol ?? null,
            minorUnit: typeof c.minorUnit === 'number' ? c.minorUnit : 2,
        }));

        await Currency.bulkCreate(records, {
            updateOnDuplicate: ['numericCode', 'name', 'symbol', 'minorUnit', 'updatedAt'],
        });

        res.status(200).json({ message: 'Default currencies loaded.', total: records.length });
    } catch (error) {
        console.error('Error seeding currencies:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/admin/currencies  (System Admin maintenance — every currency)
exports.listAllCurrencies = async (req, res) => {
    try {
        const currencies = await Currency.findAll({ order: [['code', 'ASC']] });
        res.status(200).json(currencies);
    } catch (error) {
        console.error('Error listing currencies:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/admin/currencies   Body: { code, name, symbol?, numericCode?, minorUnit? }
exports.createCurrency = async (req, res) => {
    try {
        const code = normalizeCode(req.body.code);
        const name = String(req.body.name || '').trim();
        if (!/^[A-Z]{3}$/.test(code)) return res.status(400).json({ message: 'Code must be a 3-letter ISO 4217 code.' });
        if (!name) return res.status(400).json({ message: 'Name is required.' });

        const existing = await Currency.findByPk(code);
        if (existing) return res.status(409).json({ message: `Currency '${code}' already exists.` });

        const currency = await Currency.create({
            code,
            name,
            symbol: req.body.symbol ? String(req.body.symbol).trim() : null,
            numericCode: Number.isInteger(req.body.numericCode) ? req.body.numericCode : null,
            minorUnit: Number.isInteger(req.body.minorUnit) ? req.body.minorUnit : 2,
        });
        res.status(201).json({ message: 'Currency created.', currency });
    } catch (error) {
        console.error('Error creating currency:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/admin/currencies/:code   Body: { name?, symbol?, minorUnit?, numericCode?, isActive? }
exports.updateCurrency = async (req, res) => {
    try {
        const code = normalizeCode(req.params.code);
        const currency = await Currency.findByPk(code);
        if (!currency) return res.status(404).json({ message: 'Currency not found.' });

        if (typeof req.body.name === 'string' && req.body.name.trim()) currency.name = req.body.name.trim();
        if (typeof req.body.symbol === 'string') currency.symbol = req.body.symbol.trim() || null;
        if (Number.isInteger(req.body.minorUnit)) currency.minorUnit = req.body.minorUnit;
        if (Number.isInteger(req.body.numericCode)) currency.numericCode = req.body.numericCode;
        if (typeof req.body.isActive === 'boolean') currency.isActive = req.body.isActive;
        await currency.save();

        res.status(200).json({ message: 'Currency updated.', currency });
    } catch (error) {
        console.error('Error updating currency:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/admin/currencies/:code
exports.deleteCurrency = async (req, res) => {
    try {
        const code = normalizeCode(req.params.code);
        const currency = await Currency.findByPk(code);
        if (!currency) return res.status(404).json({ message: 'Currency not found.' });

        await currency.destroy();
        res.status(200).json({ message: 'Currency deleted.' });
    } catch (error) {
        console.error('Error deleting currency:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/currencies  (any authenticated user — active currencies for pickers)
exports.listActiveCurrencies = async (req, res) => {
    try {
        const currencies = await Currency.findAll({
            where: { isActive: true },
            attributes: ['code', 'name', 'symbol', 'minorUnit'],
            order: [['code', 'ASC']],
        });
        res.status(200).json(currencies);
    } catch (error) {
        console.error('Error listing active currencies:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
