// Account-currency rules for the AR ledger (multicurrency step 2, 2026-08-21).
//
// The one load-bearing rule: currency lives per DEBTOR ACCOUNT, never per
// document. This module answers the three questions every door needs:
//   - what is the company's multi-currency state (gate, base, keyable set)?
//   - which currency may a NEW / EDITED Other Debtor account carry?
//   - may an existing account's currency still change (no documents yet)?
// Membership/member accounts always carry the base currency; the only place a
// foreign currency enters is an Other Debtor account while the AR Spec gate is
// on. A NULL currencyCode (backfill window) reads as the base currency.

const { getCompanyBaseCurrency, listAccountCurrencies } = require('../../platform/serviceContext');

function httpError(status, message) { const e = new Error(message); e.httpStatus = status; return e; }

// { enabled, baseCurrencyCode, currencies: [{ code, name, symbol }] } - the
// currencies list is the subscriber's set (base included, flagged) and only
// travels when the gate is on, so single-currency screens stay unchanged.
async function getMultiCurrencyState(req, companyId) {
    const { getSetting } = require('./arStatement.service');
    const [setting, baseCurrencyCode] = await Promise.all([getSetting(companyId), getCompanyBaseCurrency(companyId)]);
    const enabled = setting.multiCurrencyEnabled === true && !!baseCurrencyCode;
    const currencies = enabled
        ? (await listAccountCurrencies(req)).map((c) => ({ code: c.code, name: c.name, symbol: c.symbol, isBase: c.code === baseCurrencyCode }))
        : [];
    return { enabled, baseCurrencyCode, currencies };
}

// The currency an Other Debtor account is opened in: the requested code when
// multi-currency is on and it belongs to the subscriber's set, otherwise the
// base currency (a request for a foreign currency while the gate is off is an
// error, never silently downgraded). Returns the resolved code (may be null
// when the company has no default currency yet - single-currency legacy).
async function resolveOtherDebtorCurrency(req, companyId, requested) {
    const code = typeof requested === 'string' && requested.trim() ? requested.trim().toUpperCase() : null;
    const state = await getMultiCurrencyState(req, companyId);
    if (!code || code === state.baseCurrencyCode) return state.baseCurrencyCode;
    if (!state.enabled) {
        throw httpError(400, 'Multi-currency is switched off in AR Specification - accounts are opened in the base currency.');
    }
    if (!state.currencies.some((c) => c.code === code)) {
        throw httpError(400, `${code} is not in your subscription's currency set (Account Currencies).`);
    }
    return code;
}

// An account's currency is immutable once anything financial references it:
// any Ledger / Receipt / Deposit row (drafts included - a draft already
// carries the account's unit).
async function accountHasDocuments(debtorId, transaction = null) {
    const Ledger = require('./ledger.model');
    const Receipt = require('./receipt.model');
    const Deposit = require('./deposit.model');
    const opts = { where: { debtorId }, transaction };
    const [l, r, d] = await Promise.all([Ledger.count(opts), Receipt.count(opts), Deposit.count(opts)]);
    return l + r + d > 0;
}

// Display helper: the account currency with the NULL-reads-as-base rule.
function effectiveCurrency(code, baseCurrencyCode) {
    return code || baseCurrencyCode || null;
}

module.exports = {
    getMultiCurrencyState,
    resolveOtherDebtorCurrency,
    accountHasDocuments,
    effectiveCurrency,
};
