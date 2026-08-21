// Exchange Rates (Account Receivable -> Master File Setup; multicurrency step 1,
// 2026-08-21). The company's effective-dated foreign-currency rate table:
// 1 unit of the foreign currency = `rate` units of the company BASE currency
// (Company.defaultCurrencyCode). Maintained on /ar/exchange-rates; consumed by
// the document entry dialogs (later steps) as the default rate at docDate.

const { Op } = require('sequelize');
const ExchangeRate = require('./exchangeRate.model');
const {
    getUserContext,
    getCallerPlacement,
    canModifyRecord,
    annotateCanModify,
    getCompanyBaseCurrency,
    listAccountCurrencies,
} = require('../../platform/serviceContext');
const { validate, fields, z } = require('../../platform/validate');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

function toDto(r, canModify = true) {
    return {
        id: r.id,
        canModify,
        currencyCode: r.currencyCode,
        effectiveDate: r.effectiveDate,
        // DECIMAL arrives as a string; ship it verbatim (no float round-trip).
        rate: r.rate,
        updatedAt: r.updatedAt,
    };
}

// --- Zod schemas (boundary validation; unknown keys stripped) ---
const currencyCode = z.string('Currency is required.').trim().length(3, 'Currency must be a 3-letter ISO code.').toUpperCase();
const effectiveDate = z.string('Effective date is required.').trim().regex(DATE_RE, 'Effective date must be YYYY-MM-DD.');
// A rate arrives as a number (the web's number input) or a decimal string; it
// is validated on its TEXT form so the 10-decimal column precision is checked
// exactly (no float rounding), then carried as a number.
const rate = z.preprocess(
    (v) => (v === null || v === undefined ? '' : String(v).trim()),
    z.string().regex(/^\d+(\.\d{1,10})?$/, 'Rate must be a positive decimal with at most 10 decimal places.'),
)
    .transform(Number)
    .refine((n) => n > 0, 'Rate must be greater than zero.')
    .refine((n) => n < 1e11, 'Rate is too large.');

exports.validateCreate = validate({
    body: z.object({ currencyCode, effectiveDate, rate }),
});
exports.validateUpdate = validate({
    params: z.object({ id: fields.uuid }),
    body: z.object({ effectiveDate, rate }),
});
exports.validateId = validate({
    params: z.object({ id: fields.uuid }),
});
exports.validateList = validate({
    query: z.object({ currencyCode: z.string().trim().length(3).toUpperCase().optional() }),
});

// The subscriber's currency set minus the base currency = the currencies a
// rate can be keyed for. Shared with the screen meta.
async function foreignCurrencies(req, baseCurrencyCode) {
    const all = await listAccountCurrencies(req);
    return all
        .filter((c) => c.code !== baseCurrencyCode)
        .map((c) => ({ code: c.code, name: c.name, symbol: c.symbol }));
}

// GET /api/ar/exchange-rates/meta - base currency + keyable currencies + gate.
exports.getMeta = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const arStatement = require('./arStatement.service');
        const [baseCurrencyCode, setting] = await Promise.all([
            getCompanyBaseCurrency(companyId),
            arStatement.getSetting(companyId),
        ]);
        res.status(200).json({
            baseCurrencyCode,
            multiCurrencyEnabled: setting.multiCurrencyEnabled === true,
            currencies: baseCurrencyCode ? await foreignCurrencies(req, baseCurrencyCode) : [],
        });
    } catch (error) {
        console.error('Error loading exchange rate meta:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/ar/exchange-rates[?currencyCode=USD] - the company's rate history,
// newest effective date first within each currency.
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const where = { companyId };
        if (req.query.currencyCode) where.currencyCode = req.query.currencyCode;
        const rows = await ExchangeRate.findAll({
            where,
            order: [['currencyCode', 'ASC'], ['effectiveDate', 'DESC']],
        });
        const flags = await annotateCanModify(req, rows);
        res.status(200).json(rows.map((r, i) => toDto(r, flags[i])));
    } catch (error) {
        console.error('Error listing exchange rates:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// The currency must be a foreign one from the subscriber's set (the base
// currency has no rate against itself).
async function currencyError(req, companyId, code) {
    const base = await getCompanyBaseCurrency(companyId);
    if (!base) return 'Set the company default currency (Companies screen) first - rates are expressed against it.';
    if (code === base) return `${code} is the base currency - rates are keyed for foreign currencies only.`;
    const allowed = await foreignCurrencies(req, base);
    if (!allowed.some((c) => c.code === code)) {
        return `${code} is not in your subscription's currency set (Account Currencies).`;
    }
    return null;
}

// POST /api/ar/exchange-rates { currencyCode, effectiveDate, rate }
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const { currencyCode: code, effectiveDate: date, rate: value } = req.body;

        const curErr = await currencyError(req, companyId, code);
        if (curErr) return res.status(400).json({ message: curErr });

        const clash = await ExchangeRate.findOne({ where: { companyId, currencyCode: code, effectiveDate: date } });
        if (clash) return res.status(409).json({ message: `A ${code} rate effective ${date} already exists - edit that row instead.` });

        const placement = await getCallerPlacement(req);
        const callerId = getUserContext(req).userId;
        const row = await ExchangeRate.create({
            companyId,
            currencyCode: code,
            effectiveDate: date,
            rate: value.toFixed(10),
            createdBy: callerId,
            createdByDepartmentId: placement.departmentId,
            updatedBy: callerId,
        });
        res.status(201).json({ message: `${code} rate effective ${date} saved.`, exchangeRate: toDto(row) });
    } catch (error) {
        console.error('Error creating exchange rate:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/ar/exchange-rates/:id { effectiveDate, rate } - the currency is
// immutable (a rate belongs to its currency; re-key under another one).
exports.update = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await ExchangeRate.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Exchange rate not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }
        const { effectiveDate: date, rate: value } = req.body;
        if (date !== row.effectiveDate) {
            const clash = await ExchangeRate.findOne({
                where: { companyId, currencyCode: row.currencyCode, effectiveDate: date, id: { [Op.ne]: row.id } },
            });
            if (clash) return res.status(409).json({ message: `A ${row.currencyCode} rate effective ${date} already exists.` });
        }
        row.effectiveDate = date;
        row.rate = value.toFixed(10);
        row.updatedBy = getUserContext(req).userId;
        await row.save();
        res.status(200).json({ message: `${row.currencyCode} rate effective ${date} updated.`, exchangeRate: toDto(row) });
    } catch (error) {
        console.error('Error updating exchange rate:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/ar/exchange-rates/:id - safe at any time: documents snapshot
// the rate they used, so removing a table row only changes future defaults.
exports.remove = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await ExchangeRate.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Exchange rate not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }
        await row.destroy();
        res.status(200).json({ message: `${row.currencyCode} rate effective ${row.effectiveDate} deleted.` });
    } catch (error) {
        console.error('Error deleting exchange rate:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
