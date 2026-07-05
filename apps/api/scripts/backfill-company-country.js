// scripts/backfill-company-country.js
//
// One-time, IDEMPOTENT data migration.
//
// Company.country used to store a display NAME ("Malaysia"). Now that the Country
// reference table exists, companies store the ISO alpha-2 CODE ("my") instead -
// stable across name/language variants and joinable to Country. This script:
//   1. Ensures the "Others" choice ('zz') exists in the Country table (in case the
//      table was synced before that row was added, and won't be re-synced).
//   2. Converts each Company.country that is still a name into its alpha-2 code,
//      matching case-insensitively against the English name AND every localized
//      name in the Country.names JSONB. Values already stored as a valid code are
//      left alone; names with no match are left as-is and reported (a human can
//      fix them or pick "Others" in the UI).
//
// Safe to run multiple times.
//
//   node scripts/backfill-company-country.js              (apply)
//   node scripts/backfill-company-country.js --dry-run    (preview only, no writes)

require('dotenv').config();
const { sequelize } = require('../src/platform/db');
const Company = require('../src/modules/saas/company.model');
const Country = require('../src/modules/saas/country.model');
const { OTHERS_COUNTRY } = require('../src/modules/saas/country-constants');

const DRY_RUN = process.argv.includes('--dry-run');

(async () => {
    try {
        await sequelize.authenticate();
        console.log(DRY_RUN
            ? 'DRY RUN - previewing Company.country name -> alpha-2 conversions (no changes will be made):'
            : 'Backfilling Company.country to ISO alpha-2 codes...');

        // 1. Ensure the "Others" row exists (idempotent).
        const [others, createdOthers] = await Country.findOrCreate({
            where: { alpha2: OTHERS_COUNTRY.alpha2 },
            defaults: { ...OTHERS_COUNTRY, syncedAt: new Date() },
        });
        if (!DRY_RUN && createdOthers) {
            console.log(`  added "Others" choice (${others.alpha2})`);
        } else if (DRY_RUN && !(await Country.findByPk(OTHERS_COUNTRY.alpha2))) {
            console.log(`  would add "Others" choice (${OTHERS_COUNTRY.alpha2})`);
        }

        // 2. Build lookup structures from the Country table.
        const countries = await Country.findAll({ attributes: ['alpha2', 'name', 'names'] });
        const validCodes = new Set(countries.map((c) => c.alpha2.toLowerCase()));
        const nameToCode = new Map(); // lowercased name -> alpha2
        for (const c of countries) {
            const code = c.alpha2.toLowerCase();
            if (c.name) nameToCode.set(c.name.trim().toLowerCase(), code);
            for (const localized of Object.values(c.names || {})) {
                if (localized) nameToCode.set(String(localized).trim().toLowerCase(), code);
            }
        }

        const companies = await Company.findAll({ attributes: ['id', 'name', 'country'] });

        let converted = 0;
        let already = 0;
        const unmatched = [];

        for (const co of companies) {
            const raw = (co.country || '').trim();
            if (!raw) continue; // blank stays blank

            const lower = raw.toLowerCase();
            if (validCodes.has(lower)) { already++; continue; } // already a code

            const code = nameToCode.get(lower);
            if (!code) { unmatched.push(co); continue; }

            console.log(`  ${DRY_RUN ? 'would set' : 'setting'}  ${co.name}: "${raw}" -> ${code}`);
            if (!DRY_RUN) { co.country = code; await co.save(); }
            converted++;
        }

        console.log(
            `\n${DRY_RUN ? 'Dry run summary' : 'Done'}: ` +
            `${converted} converted, ${already} already codes, ${unmatched.length} unmatched.`,
        );
        if (unmatched.length) {
            console.log('Unmatched (left unchanged - fix manually or pick "Others" in the UI):');
            for (const co of unmatched) console.log(`  - ${co.name}: "${co.country}"`);
        }
        if (DRY_RUN) console.log('Re-run without --dry-run to apply.');
        process.exit(0);
    } catch (err) {
        console.error('Backfill failed:', err);
        process.exit(1);
    }
})();
