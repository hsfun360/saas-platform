const Currency = require('./currency.model');
const AccountCurrency = require('./accountCurrency.model');
const Account = require('./account.model');

// Central helpers for the subscriber-currency feature, shared by the tenant
// self-service and System Admin endpoints.

// All active platform currencies ({ code, name, symbol, minorUnit }), code-sorted.
async function getActiveCurrencies() {
    return Currency.findAll({
        where: { isActive: true },
        attributes: ['code', 'name', 'symbol', 'minorUnit'],
        order: [['code', 'ASC']],
    });
}

// The set of currencies an account has opted into, as active rows, plus the
// account's chosen default. Unlike languages there is NO platform fallback -
// currency is optional, so an account that opted into none has an empty set and a
// null default (a company just leaves its currency unset).
async function getAccountCurrencyState(accountId) {
    const [active, links, account] = await Promise.all([
        getActiveCurrencies(),
        AccountCurrency.findAll({ where: { accountId }, attributes: ['currencyCode'] }),
        Account.findByPk(accountId, { attributes: ['defaultCurrencyCode'] }),
    ]);

    const activeByCode = new Map(active.map((c) => [c.code, c]));
    const selected = links
        .map((l) => l.currencyCode)
        .filter((c) => activeByCode.has(c)) // drop any that were later deactivated
        .map((c) => activeByCode.get(c));

    let defaultCurrencyCode = account?.defaultCurrencyCode || null;
    const selectedSet = new Set(selected.map((c) => c.code));
    if (defaultCurrencyCode && !selectedSet.has(defaultCurrencyCode)) defaultCurrencyCode = null;
    if (!defaultCurrencyCode && selected.length) defaultCurrencyCode = selected[0].code;

    return { available: active, selected, defaultCurrencyCode };
}

module.exports = { getActiveCurrencies, getAccountCurrencyState };
