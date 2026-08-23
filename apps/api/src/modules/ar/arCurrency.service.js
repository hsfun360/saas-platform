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

// --- Document exchange rates (step 3) ---------------------------------------
// Every document on an account is in the ACCOUNT's currency; what varies per
// document is the RATE to base (frozen on the row). Base-currency accounts
// always carry rate 1, so single-currency companies never see a rate.

const RATE_RE = /^\d+(\.\d{1,10})?$/;

// A keyed rate from a request body: undefined/null/'' = none; otherwise must
// be a positive decimal with at most 10 places. Returns a Number or throws.
function parseRequestedRate(value) {
    if (value === undefined || value === null || value === '') return null;
    const text = String(value).trim();
    if (!RATE_RE.test(text) || !(Number(text) > 0)) {
        throw httpError(400, 'Exchange rate must be a positive decimal with at most 10 decimal places.');
    }
    return Number(text);
}

// The company's rate for a currency on a date: latest effectiveDate <= onDate.
async function lookupRate(companyId, currencyCode, onDate, transaction = null) {
    const ExchangeRate = require('./exchangeRate.model');
    const { Op } = require('sequelize');
    const row = await ExchangeRate.findOne({
        where: { companyId, currencyCode, effectiveDate: { [Op.lte]: onDate } },
        order: [['effectiveDate', 'DESC']],
        attributes: ['rate', 'effectiveDate'],
        transaction,
    });
    return row ? Number(row.rate) : null;
}

// The currency's full rate history for the entry dialogs (they default the
// rate per document date client-side; the server re-resolves when none is
// keyed). Small per currency by nature.
async function listRates(companyId, currencyCode) {
    const ExchangeRate = require('./exchangeRate.model');
    const rows = await ExchangeRate.findAll({
        where: { companyId, currencyCode },
        order: [['effectiveDate', 'ASC']],
        attributes: ['effectiveDate', 'rate'],
    });
    return rows.map((r) => ({ effectiveDate: r.effectiveDate, rate: r.rate }));
}

// THE resolution every document door calls before stamping a row:
//   { currencyCode, exchangeRate (Number), isBase }
// - base-currency account (or no base configured) -> rate 1, no lookup;
// - foreign account -> the keyed rate when given, else the rate table at
//   docDate; none -> a 400 that names what to do.
async function resolveDocumentFx({ companyId, debtor, docDate, requestedRate = null, transaction = null }) {
    const baseCurrencyCode = await getCompanyBaseCurrency(companyId);
    const currencyCode = effectiveCurrency(debtor.currencyCode, baseCurrencyCode);
    if (!currencyCode || !baseCurrencyCode || currencyCode === baseCurrencyCode) {
        return { currencyCode, exchangeRate: 1, isBase: true };
    }
    const keyed = parseRequestedRate(requestedRate);
    if (keyed) return { currencyCode, exchangeRate: keyed, isBase: false };
    const tableRate = await lookupRate(companyId, currencyCode, docDate, transaction);
    if (!tableRate) {
        throw httpError(400, `No ${currencyCode} exchange rate is effective on ${docDate} - add one under Exchange Rates or key the rate on the document.`);
    }
    return { currencyCode, exchangeRate: tableRate, isBase: false };
}

// Integer-cents conversion at the row's rate (half-up on the base cent).
function baseCents(cents, exchangeRate) {
    return Math.round(Number(cents) * Number(exchangeRate));
}

const money = (c) => (c / 100).toFixed(2);
const rateText = (r) => Number(r).toFixed(10);

// The stamp for a Ledger row from its cents + resolved fx.
function ledgerFxColumns(fx, { netC, taxC, grossC }) {
    return {
        currencyCode: fx.currencyCode,
        exchangeRate: rateText(fx.exchangeRate),
        baseNetAmount: money(baseCents(netC, fx.exchangeRate)),
        baseTaxAmount: money(baseCents(taxC, fx.exchangeRate)),
        baseGrossAmount: money(baseCents(grossC, fx.exchangeRate)),
    };
}

// The stamp for a Receipt / Deposit row (single amount).
function amountFxColumns(fx, amountC) {
    return {
        currencyCode: fx.currencyCode,
        exchangeRate: rateText(fx.exchangeRate),
        baseAmount: money(baseCents(amountC, fx.exchangeRate)),
    };
}

module.exports = {
    getMultiCurrencyState,
    resolveOtherDebtorCurrency,
    accountHasDocuments,
    effectiveCurrency,
    parseRequestedRate,
    lookupRate,
    listRates,
    resolveDocumentFx,
    baseCents,
    ledgerFxColumns,
    amountFxColumns,
};
