// Shared language constants.
//
// The platform's ultimate fallback language - always valid, used when a subscriber
// has opted into no languages and when a user/account has no resolvable preference.
// Kept in sync with the English seed in language-defaults.js.
const PLATFORM_DEFAULT_LANGUAGE = 'en';

// Resolve the language a user should actually see, given their personal preference,
// their account's default, and the set the account opted into. Order:
//   1. the user's preferred language, if it's in the allowed set
//   2. the account's default language, if set and allowed
//   3. the first allowed language
//   4. the platform default ('en')
// `allowed` is the list of language codes the account opted into (may be empty).
function resolveEffectiveLanguage(preferred, accountDefault, allowed) {
    const set = new Set((allowed || []).map((c) => String(c).toLowerCase()));
    const pref = preferred ? String(preferred).toLowerCase() : null;
    const def = accountDefault ? String(accountDefault).toLowerCase() : null;
    if (pref && set.has(pref)) return pref;
    if (def && set.has(def)) return def;
    if (set.size > 0) return [...set][0];
    return PLATFORM_DEFAULT_LANGUAGE;
}

module.exports = { PLATFORM_DEFAULT_LANGUAGE, resolveEffectiveLanguage };
