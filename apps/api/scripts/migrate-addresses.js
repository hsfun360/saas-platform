// scripts/migrate-addresses.js
//
// One-off migration for the typed address book (2026-07-17):
//   1. Create membership."Address" (from the model definition).
//   2. Backfill rows from the inline address blocks:
//        Member.resident*                 -> addressType 'residential'
//        Member.mailing*   (source=other) -> addressType 'mailing'
//        Membership.address/postcode/...  -> addressType 'company'
//        Membership.mailing* (source=other) -> addressType 'mailing'
//      (mailingSource resident/main/employer stored NO separate mailing copy,
//       so those need no row - the resolution rule falls back automatically.)
//   3. Drop the 19 replaced columns from the two tables.
//
// Idempotent-ish: backfill skips owners that already have rows; the drops are
// IF EXISTS. Run from apps/api BEFORE deploying the release that removes the
// columns from the models:  node scripts/migrate-addresses.js [--dry-run]

require('dotenv').config();
const { sequelize } = require('../src/platform/db');
const Address = require('../src/modules/membership/address.model');
require('../src/wiring/associations');

const DRY = process.argv.includes('--dry-run');

async function main() {
    await sequelize.authenticate();

    // 1. The new table (+ its unique indexes).
    if (!DRY) await Address.sync();
    console.log(`${DRY ? '[dry-run] would create' : 'Created/ensured'} membership."Address".`);

    // 2. Backfill. INSERT ... SELECT so it runs in one round-trip per source,
    //    skipping owners that already have a row of that type.
    const inserts = [
        ['Member residential', `
            INSERT INTO membership."Address" (id, "companyId", "memberId", "addressType", address, city, postcode, state, "countryCode", "createdBy", "createdByDepartmentId", "updatedBy", "createdAt", "updatedAt")
            SELECT gen_random_uuid(), m."companyId", m.id, 'residential', m."residentAddress", NULL, m."residentPostcode", m."residentState", m."residentCountryCode", m."createdBy", m."createdByDepartmentId", m."updatedBy", now(), now()
            FROM membership."Member" m
            WHERE m."residentAddress" IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM membership."Address" a WHERE a."memberId" = m.id AND a."addressType" = 'residential')`],
        ['Member mailing', `
            INSERT INTO membership."Address" (id, "companyId", "memberId", "addressType", address, city, postcode, state, "countryCode", "createdBy", "createdByDepartmentId", "updatedBy", "createdAt", "updatedAt")
            SELECT gen_random_uuid(), m."companyId", m.id, 'mailing', m."mailingAddress", NULL, m."mailingPostcode", m."mailingState", m."mailingCountryCode", m."createdBy", m."createdByDepartmentId", m."updatedBy", now(), now()
            FROM membership."Member" m
            WHERE m."mailingSource" = 'other' AND m."mailingAddress" IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM membership."Address" a WHERE a."memberId" = m.id AND a."addressType" = 'mailing')`],
        ['Membership company', `
            INSERT INTO membership."Address" (id, "companyId", "membershipId", "addressType", address, city, postcode, state, "countryCode", "createdBy", "createdByDepartmentId", "updatedBy", "createdAt", "updatedAt")
            SELECT gen_random_uuid(), ms."companyId", ms.id, 'company', ms.address, NULL, ms.postcode, ms.state, ms."countryCode", ms."createdBy", ms."createdByDepartmentId", ms."updatedBy", now(), now()
            FROM membership."Membership" ms
            WHERE ms.address IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM membership."Address" a WHERE a."membershipId" = ms.id AND a."addressType" = 'company')`],
        ['Membership mailing', `
            INSERT INTO membership."Address" (id, "companyId", "membershipId", "addressType", address, city, postcode, state, "countryCode", "createdBy", "createdByDepartmentId", "updatedBy", "createdAt", "updatedAt")
            SELECT gen_random_uuid(), ms."companyId", ms.id, 'mailing', ms."mailingAddress", NULL, ms."mailingPostcode", ms."mailingState", ms."mailingCountryCode", ms."createdBy", ms."createdByDepartmentId", ms."updatedBy", now(), now()
            FROM membership."Membership" ms
            WHERE ms."mailingSource" = 'other' AND ms."mailingAddress" IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM membership."Address" a WHERE a."membershipId" = ms.id AND a."addressType" = 'mailing')`],
    ];
    for (const [label, sql] of inserts) {
        if (DRY) {
            console.log(`[dry-run] would backfill: ${label}`);
        } else {
            const [, meta] = await sequelize.query(sql);
            console.log(`Backfilled ${label}: ${meta?.rowCount ?? '?'} row(s).`);
        }
    }

    // 3. Drop the replaced columns.
    const drops = [
        `ALTER TABLE membership."Member"
            DROP COLUMN IF EXISTS "residentAddress", DROP COLUMN IF EXISTS "residentPostcode",
            DROP COLUMN IF EXISTS "residentState", DROP COLUMN IF EXISTS "residentCountryCode",
            DROP COLUMN IF EXISTS "mailingSource", DROP COLUMN IF EXISTS "mailingAddress",
            DROP COLUMN IF EXISTS "mailingPostcode", DROP COLUMN IF EXISTS "mailingState",
            DROP COLUMN IF EXISTS "mailingCountryCode"`,
        `ALTER TABLE membership."Membership"
            DROP COLUMN IF EXISTS "address", DROP COLUMN IF EXISTS "postcode",
            DROP COLUMN IF EXISTS "state", DROP COLUMN IF EXISTS "countryCode",
            DROP COLUMN IF EXISTS "mailingSource", DROP COLUMN IF EXISTS "mailingAddress",
            DROP COLUMN IF EXISTS "mailingPostcode", DROP COLUMN IF EXISTS "mailingState",
            DROP COLUMN IF EXISTS "mailingCountryCode"`,
    ];
    for (const sql of drops) {
        if (DRY) {
            console.log('[dry-run] would drop replaced columns.');
        } else {
            await sequelize.query(sql);
        }
    }
    if (!DRY) console.log('Dropped the replaced columns from Member + Membership.');

    const [count] = await sequelize.query('SELECT count(*)::int AS n FROM membership."Address"').catch(() => [[{ n: 'n/a' }]]);
    console.log(`Address rows now: ${count[0].n}`);
    await sequelize.close();
}

main().catch((e) => { console.error('Migration failed:', e); process.exit(1); });
