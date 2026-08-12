// Address formatting - THE app-wide standard for rendering a postal address
// block (statements, invoices, letters, any printed or displayed full address):
//
//     line1
//     line2
//     line3
//     <postcode> <city> <state>     (one line, blanks skipped)
//     <country full name>           (never the alpha-2 code)
//
// Country names resolve through the Country reference table (alpha-2 key,
// English display name), cached in-process; an unknown code falls back to the
// uppercased code so rendering never blocks on reference data.
//
// This lives in platform/ as a seam: consumers call these helpers, they never
// require the Control-Plane Country model themselves. The Angular twin is
// apps/web/src/app/shared/address.ts - keep the line rules in sync.

const TTL_MS = 10 * 60 * 1000;
let cache = { at: 0, names: new Map() };

async function countryNames() {
    if (cache.names.size === 0 || Date.now() - cache.at > TTL_MS) {
        try {
            const Country = require('../modules/saas/country.model');
            const rows = await Country.findAll({ attributes: ['alpha2', 'name'] });
            cache = { at: Date.now(), names: new Map(rows.map((r) => [String(r.alpha2).toLowerCase(), r.name])) };
        } catch {
            cache.at = Date.now(); // keep whatever we had; retry after the TTL
        }
    }
    return cache.names;
}

// 'my' / 'MY' -> 'Malaysia'; unknown/unsynced codes fall back to 'MY'.
async function resolveCountryName(code) {
    if (!code) return null;
    const names = await countryNames();
    return names.get(String(code).toLowerCase()) || String(code).toUpperCase();
}

// Address object ({ line1, line2, line3?, city, state, postcode, countryCode })
// -> display lines per the standard above.
async function formatAddressLines(a) {
    if (!a) return [];
    return [
        a.line1, a.line2, a.line3,
        [a.postcode, a.city, a.state].filter(Boolean).join(' '),
        await resolveCountryName(a.countryCode),
    ].filter(Boolean);
}

// Non-destructively annotate an address JSON with the resolved country display
// name (`country`), so API responses let clients render the standard without
// their own country lookup.
async function withCountryName(a) {
    if (!a) return a;
    return { ...a, country: await resolveCountryName(a.countryCode) };
}

module.exports = { resolveCountryName, formatAddressLines, withCountryName };
