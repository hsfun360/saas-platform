const Language = require('./language.model');
const AccountLanguage = require('./accountLanguage.model');
const Account = require('./account.model');
const { PLATFORM_DEFAULT_LANGUAGE, resolveEffectiveLanguage } = require('./language-constants');

// Central helpers for the subscriber-language feature, shared by the tenant
// self-service, System Admin, and per-user language endpoints.

// All active platform languages ({ languageCode, name }), name-sorted.
async function getActiveLanguages() {
    return Language.findAll({
        where: { isActive: true },
        attributes: ['languageCode', 'name'],
        order: [['name', 'ASC']],
    });
}

// The set of languages an account has opted into, as active { languageCode, name }
// rows (name-sorted), plus the account's chosen default. If the account opted into
// nothing, the allowed set falls back to the platform default so users always have
// at least one valid choice.
async function getAccountLanguageState(accountId) {
    const [active, links, account] = await Promise.all([
        getActiveLanguages(),
        AccountLanguage.findAll({ where: { accountId }, attributes: ['languageCode'] }),
        Account.findByPk(accountId, { attributes: ['defaultLanguageCode'] }),
    ]);

    const activeByCode = new Map(active.map((l) => [l.languageCode, l]));
    const selectedCodes = links
        .map((l) => l.languageCode)
        .filter((c) => activeByCode.has(c)); // drop any that were later deactivated

    let selected = selectedCodes.map((c) => activeByCode.get(c));
    if (selected.length === 0) {
        // Fallback: the platform default if it's active, else the first active language.
        const fallback = activeByCode.get(PLATFORM_DEFAULT_LANGUAGE) || active[0] || null;
        selected = fallback ? [fallback] : [];
    }

    let defaultLanguageCode = account?.defaultLanguageCode || null;
    const selectedSet = new Set(selected.map((l) => l.languageCode));
    if (defaultLanguageCode && !selectedSet.has(defaultLanguageCode)) defaultLanguageCode = null;
    if (!defaultLanguageCode && selected.length) defaultLanguageCode = selected[0].languageCode;

    return { available: active, selected, defaultLanguageCode };
}

// The languages a specific user may pick from + their resolved effective language.
// `accountId` may be null (e.g. a System Administration workspace with no
// subscriber) - then all active languages are allowed.
async function getUserLanguageState(user, accountId) {
    let available;
    let accountDefault = null;
    if (accountId) {
        const state = await getAccountLanguageState(accountId);
        available = state.selected;
        accountDefault = state.defaultLanguageCode;
    } else {
        available = await getActiveLanguages();
    }

    const allowedCodes = available.map((l) => l.languageCode);
    const effective = resolveEffectiveLanguage(user?.preferredLanguage, accountDefault, allowedCodes);
    return {
        options: available,
        preferred: user?.preferredLanguage || null,
        accountDefault,
        effective,
    };
}

module.exports = {
    PLATFORM_DEFAULT_LANGUAGE,
    getActiveLanguages,
    getAccountLanguageState,
    getUserLanguageState,
};
