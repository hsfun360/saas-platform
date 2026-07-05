const Country = require('./country.model');
const { DIAL_CODES } = require('./dial-codes');
const { OTHERS_ALPHA2, OTHERS_COUNTRY } = require('./country-constants');

// Country reference data is synced from the open-source stefangabos/world_countries
// dataset: per-language files of { id, alpha2, alpha3, name }. We fetch every
// available language and fold the names into one row per country. Calling codes and
// timezones are NOT in this dataset (handled elsewhere).
const WORLD_COUNTRIES_BASE = 'https://raw.githubusercontent.com/stefangabos/world_countries/master/data/countries';
const WORLD_COUNTRIES_LANGS = [
    'ar', 'bg', 'br', 'cs', 'da', 'de', 'el', 'en', 'eo', 'es', 'et', 'eu', 'fa',
    'fi', 'fr', 'hr', 'hu', 'hy', 'it', 'ja', 'ko', 'lt', 'nl', 'no', 'pl', 'pt',
    'ro', 'ru', 'sk', 'sl', 'sr', 'sv', 'th', 'tr', 'uk', 'zh-tw', 'zh',
];

// Emoji flag from an alpha-2 code (two regional-indicator symbols).
function flagEmoji(alpha2) {
    if (!alpha2 || alpha2.length !== 2) return null;
    const codePoints = [...alpha2.toUpperCase()].map((ch) => 127397 + ch.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
}

// POST /api/admin/countries/sync
// Fetch every language file, upsert one row per country. Idempotent; preserves
// each row's isActive flag (only names/codes/flag/syncedAt are refreshed).
exports.syncCountries = async (req, res) => {
    try {
        const byAlpha2 = new Map();
        let languagesLoaded = 0;

        for (const lang of WORLD_COUNTRIES_LANGS) {
            let list;
            try {
                const resp = await fetch(`${WORLD_COUNTRIES_BASE}/${lang}/countries.json`);
                if (!resp.ok) continue;
                list = await resp.json();
            } catch (e) {
                continue; // skip a language that fails to fetch/parse
            }
            if (!Array.isArray(list)) continue;
            languagesLoaded++;

            for (const c of list) {
                if (!c || !c.alpha2) continue;
                const a2 = String(c.alpha2).toLowerCase();
                let rec = byAlpha2.get(a2);
                if (!rec) {
                    rec = { alpha2: a2, alpha3: null, numericCode: null, name: '', names: {} };
                    byAlpha2.set(a2, rec);
                }
                rec.names[lang] = c.name;
                // Prefer English (or first-seen) for the code/name defaults.
                if (lang === 'en' || !rec.alpha3) rec.alpha3 = c.alpha3 ? String(c.alpha3).toLowerCase() : rec.alpha3;
                if (lang === 'en' || rec.numericCode == null) rec.numericCode = c.id ?? rec.numericCode;
                if (lang === 'en' || !rec.name) rec.name = c.name;
            }
        }

        if (byAlpha2.size === 0) {
            return res.status(502).json({ message: 'Could not fetch country data from the source. Try again shortly.' });
        }

        // Preserve any manually-set dial codes for countries the bundled map doesn't cover.
        const existing = await Country.findAll({ attributes: ['alpha2', 'dialCode'] });
        const existingDial = new Map(existing.map((c) => [c.alpha2, c.dialCode]));

        const now = new Date();
        const records = [...byAlpha2.values()].map((r) => ({
            alpha2: r.alpha2,
            alpha3: r.alpha3,
            numericCode: r.numericCode,
            name: r.name || r.names.en || r.alpha2.toUpperCase(),
            names: r.names,
            flagEmoji: flagEmoji(r.alpha2),
            dialCode: DIAL_CODES[r.alpha2] ?? existingDial.get(r.alpha2) ?? null,
            syncedAt: now,
        }));

        // Always include the "Others" choice - not in world_countries, but a valid
        // list-picked value for companies whose country isn't in the reference set.
        records.push({ ...OTHERS_COUNTRY, syncedAt: now });

        // Upsert. isActive is intentionally NOT in updateOnDuplicate, so existing
        // rows keep their enabled/disabled state and new rows default to active.
        await Country.bulkCreate(records, {
            updateOnDuplicate: ['alpha3', 'numericCode', 'name', 'names', 'flagEmoji', 'dialCode', 'syncedAt', 'updatedAt'],
        });

        res.status(200).json({
            message: 'Countries synced.',
            total: records.length,
            languages: languagesLoaded,
            syncedAt: now,
        });
    } catch (error) {
        console.error('Error syncing countries:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/admin/countries  (System Admin maintenance — every country)
exports.listAllCountries = async (req, res) => {
    try {
        const countries = await Country.findAll({ order: [['name', 'ASC']] });
        res.status(200).json(countries);
    } catch (error) {
        console.error('Error listing countries:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/admin/countries/:alpha2   Body: { isActive: boolean }
exports.updateCountry = async (req, res) => {
    try {
        const alpha2 = String(req.params.alpha2 || '').toLowerCase();
        const country = await Country.findByPk(alpha2);
        if (!country) return res.status(404).json({ message: 'Country not found.' });

        if (typeof req.body.isActive === 'boolean') country.isActive = req.body.isActive;
        if (typeof req.body.dialCode === 'string') {
            const d = req.body.dialCode.trim();
            country.dialCode = d ? (d.startsWith('+') ? d : `+${d}`) : null;
        }

        // Localized names (the `names` JSONB, keyed by language code). Merge into the
        // existing map: a non-empty value sets/updates that language's translation,
        // an empty value clears it. Editing English keeps the top-level `name`
        // convenience default in sync (that's what pickers/lists show).
        if (req.body.names && typeof req.body.names === 'object' && !Array.isArray(req.body.names)) {
            const merged = { ...(country.names || {}) };
            for (const [lang, value] of Object.entries(req.body.names)) {
                const code = String(lang).trim().toLowerCase();
                if (!code) continue;
                const name = String(value ?? '').trim();
                if (name) merged[code] = name;
                else delete merged[code];
            }
            country.names = merged;
            if (merged.en) country.name = merged.en;
        }

        await country.save();
        res.status(200).json({ message: 'Country updated.', country });
    } catch (error) {
        console.error('Error updating country:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/countries  (any authenticated user — active countries for pickers)
exports.listActiveCountries = async (req, res) => {
    try {
        const countries = await Country.findAll({
            where: { isActive: true },
            attributes: ['alpha2', 'alpha3', 'name', 'flagEmoji', 'dialCode'],
            order: [['name', 'ASC']],
        });
        res.status(200).json(countries);
    } catch (error) {
        console.error('Error listing active countries:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
