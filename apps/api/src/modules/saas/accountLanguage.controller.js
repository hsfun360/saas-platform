const { sequelize } = require('../../platform/db');
const Company = require('./company.model');
const Account = require('./account.model');
const Language = require('./language.model');
const AccountLanguage = require('./accountLanguage.model');
const User = require('../identity/user.model');
const { getAccountLanguageState, getUserLanguageState } = require('./languageResolver');

// Resolve the caller's accountId from their active company (companyId = null means
// the System Administration workspace, which has no subscriber account).
async function resolveAccountId(companyId) {
    if (!companyId) return null;
    const company = await Company.findByPk(companyId, { attributes: ['accountId'] });
    return company ? company.accountId : null;
}

// Validate + persist an account's language selection. `languageCodes` is replaced
// wholesale; `defaultLanguageCode` must be within the new set (or null -> first).
async function applyAccountLanguages(accountId, body) {
    const account = await Account.findByPk(accountId);
    if (!account) return { error: 404, message: 'Account not found.' };

    const requested = Array.isArray(body.languageCodes) ? body.languageCodes : [];
    const codes = [...new Set(requested.map((c) => String(c).trim().toLowerCase()).filter(Boolean))];

    // Only allow codes that exist and are active.
    const active = await Language.findAll({ where: { isActive: true }, attributes: ['languageCode'] });
    const activeSet = new Set(active.map((l) => l.languageCode));
    const invalid = codes.filter((c) => !activeSet.has(c));
    if (invalid.length) return { error: 400, message: `Not available: ${invalid.join(', ')}.` };

    let def = body.defaultLanguageCode ? String(body.defaultLanguageCode).trim().toLowerCase() : null;
    if (def && !codes.includes(def)) return { error: 400, message: 'Default must be one of the selected languages.' };
    if (!def && codes.length) def = codes[0];
    if (!codes.length) def = null;

    await sequelize.transaction(async (t) => {
        await AccountLanguage.destroy({ where: { accountId }, transaction: t });
        if (codes.length) {
            await AccountLanguage.bulkCreate(
                codes.map((languageCode) => ({ accountId, languageCode })),
                { transaction: t },
            );
        }
        account.defaultLanguageCode = def;
        await account.save({ transaction: t });
    });

    return { ok: true };
}

// ---- Tenant self-service (account owner / Tenant Admin) ----

// GET /auth/account/languages
exports.getAccountLanguages = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });
        const state = await getAccountLanguageState(accountId);
        res.status(200).json(state);
    } catch (error) {
        console.error('Error getting account languages:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /auth/account/languages   Body: { languageCodes: string[], defaultLanguageCode?: string }
exports.updateAccountLanguages = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });
        const result = await applyAccountLanguages(accountId, req.body);
        if (result.error) return res.status(result.error).json({ message: result.message });
        const state = await getAccountLanguageState(accountId);
        res.status(200).json({ message: 'Languages updated.', ...state });
    } catch (error) {
        console.error('Error updating account languages:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// NOTE (role separation): there are deliberately NO platform-side handlers for
// a subscriber's language selection - tenant self-service only (above).

// ---- Per-user preference ----

// GET /auth/me/language  -> options the user may pick from + their effective language
exports.getMyLanguage = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        const user = await User.findByPk(req.user.id, { attributes: ['id', 'preferredLanguage'] });
        const state = await getUserLanguageState(user, accountId);
        res.status(200).json(state);
    } catch (error) {
        console.error('Error getting user language:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /auth/me/language   Body: { language: string }
exports.setMyLanguage = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        const user = await User.findByPk(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found.' });

        const lang = req.body.language ? String(req.body.language).trim().toLowerCase() : null;
        if (lang) {
            const state = await getUserLanguageState(user, accountId);
            const allowed = new Set(state.options.map((l) => l.languageCode));
            if (!allowed.has(lang)) return res.status(400).json({ message: 'That language is not available to you.' });
        }
        user.preferredLanguage = lang;
        await user.save();

        const state = await getUserLanguageState(user, accountId);
        res.status(200).json({ message: 'Language updated.', ...state });
    } catch (error) {
        console.error('Error setting user language:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
