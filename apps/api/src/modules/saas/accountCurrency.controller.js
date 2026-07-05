const { sequelize } = require('../../platform/db');
const Company = require('./company.model');
const Account = require('./account.model');
const Currency = require('./currency.model');
const AccountCurrency = require('./accountCurrency.model');
const { getAccountCurrencyState } = require('./currencyResolver');

// Resolve the caller's accountId from their active company (companyId = null means
// the System Administration workspace, which has no subscriber account).
async function resolveAccountId(companyId) {
    if (!companyId) return null;
    const company = await Company.findByPk(companyId, { attributes: ['accountId'] });
    return company ? company.accountId : null;
}

// Validate + persist an account's currency selection. `currencyCodes` is replaced
// wholesale; `defaultCurrencyCode` must be within the new set (or null -> first).
async function applyAccountCurrencies(accountId, body) {
    const account = await Account.findByPk(accountId);
    if (!account) return { error: 404, message: 'Account not found.' };

    const requested = Array.isArray(body.currencyCodes) ? body.currencyCodes : [];
    const codes = [...new Set(requested.map((c) => String(c).trim().toUpperCase()).filter(Boolean))];

    // Only allow codes that exist and are active.
    const active = await Currency.findAll({ where: { isActive: true }, attributes: ['code'] });
    const activeSet = new Set(active.map((c) => c.code));
    const invalid = codes.filter((c) => !activeSet.has(c));
    if (invalid.length) return { error: 400, message: `Not available: ${invalid.join(', ')}.` };

    let def = body.defaultCurrencyCode ? String(body.defaultCurrencyCode).trim().toUpperCase() : null;
    if (def && !codes.includes(def)) return { error: 400, message: 'Default must be one of the selected currencies.' };
    if (!def && codes.length) def = codes[0];
    if (!codes.length) def = null;

    await sequelize.transaction(async (t) => {
        await AccountCurrency.destroy({ where: { accountId }, transaction: t });
        if (codes.length) {
            await AccountCurrency.bulkCreate(
                codes.map((currencyCode) => ({ accountId, currencyCode })),
                { transaction: t },
            );
        }
        account.defaultCurrencyCode = def;
        await account.save({ transaction: t });
    });

    return { ok: true };
}

// ---- Tenant self-service (account owner / Tenant Admin) ----

// GET /auth/account/currencies
exports.getAccountCurrencies = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });
        const state = await getAccountCurrencyState(accountId);
        res.status(200).json(state);
    } catch (error) {
        console.error('Error getting account currencies:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /auth/account/currencies   Body: { currencyCodes: string[], defaultCurrencyCode?: string }
exports.updateAccountCurrencies = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });
        const result = await applyAccountCurrencies(accountId, req.body);
        if (result.error) return res.status(result.error).json({ message: result.message });
        const state = await getAccountCurrencyState(accountId);
        res.status(200).json({ message: 'Currencies updated.', ...state });
    } catch (error) {
        console.error('Error updating account currencies:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- System Admin (Subscriber Management); :id is the Account id ----

// GET /admin/subscriptions/:id/currencies
exports.getSubscriptionCurrencies = async (req, res) => {
    try {
        const state = await getAccountCurrencyState(req.params.id);
        res.status(200).json(state);
    } catch (error) {
        console.error('Error getting subscription currencies:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /admin/subscriptions/:id/currencies
exports.updateSubscriptionCurrencies = async (req, res) => {
    try {
        const result = await applyAccountCurrencies(req.params.id, req.body);
        if (result.error) return res.status(result.error).json({ message: result.message });
        const state = await getAccountCurrencyState(req.params.id);
        res.status(200).json({ message: 'Currencies updated.', ...state });
    } catch (error) {
        console.error('Error updating subscription currencies:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
