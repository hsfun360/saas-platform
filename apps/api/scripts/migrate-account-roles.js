// scripts/migrate-account-roles.js
//
// PHASE 1 (additive, idempotent, safe to run anytime):
//   - Adds the Roles.accountId column if missing.
//   - Backfills accountId from each role's company's accountId.
//
// It does NOT merge duplicate roles or drop the legacy companyId column — that
// finalization (PHASE 4) must run only AFTER the account-role application code
// (login menu intersection + account-scoped assignment/seeding) is deployed,
// because the currently-deployed code still reads Role.companyId. The finalize
// step is provided separately (see migrate-account-roles-finalize.js) once
// Phase 3 ships.
//
//   node scripts/migrate-account-roles.js
//
// Safe to re-run: only fills accountId where it's still NULL.

const { sequelize } = require('../src/platform/db');
require('../src/wiring/associations'); // defines every model + association once
const Role = require('../src/modules/saas/role.model');
const Company = require('../src/modules/saas/company.model');

(async () => {
    try {
        await sequelize.authenticate();

        const roleTable = Role.getTableName();
        await sequelize.query(`ALTER TABLE "${roleTable}" ADD COLUMN IF NOT EXISTS "accountId" UUID;`);

        const companies = await Company.findAll({ attributes: ['id', 'accountId'] });
        const accountByCompany = new Map(companies.map(c => [c.id, c.accountId]));

        const roles = await Role.findAll();
        let fixed = 0;
        let orphan = 0;
        for (const r of roles) {
            if (r.accountId) continue;                 // already backfilled
            if (!r.companyId) { continue; }            // nothing to derive from
            const accountId = accountByCompany.get(r.companyId);
            if (!accountId) { orphan++; continue; }    // company missing — leave for review
            r.accountId = accountId;
            await r.save();
            fixed++;
        }

        console.log(`Roles total: ${roles.length}. Backfilled accountId: ${fixed}. Orphan (no company): ${orphan}.`);
        await sequelize.close();
        process.exit(0);
    } catch (error) {
        console.error('migrate-account-roles failed:', error);
        process.exit(1);
    }
})();
