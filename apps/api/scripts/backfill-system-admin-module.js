// scripts/backfill-system-admin-module.js
//
// One-time, IDEMPOTENT data migration.
//
// The "System Administration" module (the Tenant-Admin System Setup screens:
// users, roles, companies, reference data) is MANDATORY: a company without the
// entitlement leaves its Tenant Admin with no admin screens at all.
// provisionTenant() now always adds it, but companies provisioned before that
// fix (or with the module deliberately unticked in the admin portal / the
// onboarding wizard) may be missing the CompanyModule row. This script adds the
// missing entitlement to EVERY company, and re-activates it where the row
// exists but was deactivated.
//
// Safe to run multiple times.
//
//   node scripts/backfill-system-admin-module.js              (apply)
//   node scripts/backfill-system-admin-module.js --dry-run    (preview only, no writes)

require('dotenv').config();
const { sequelize } = require('../src/platform/db');
const Company = require('../src/modules/saas/company.model');
const Module = require('../src/modules/saas/module.model');
const CompanyModule = require('../src/modules/saas/companyModule.model');

const MANDATORY_MODULE_NAME = 'System Administration';
const DRY_RUN = process.argv.includes('--dry-run');

(async () => {
    try {
        await sequelize.authenticate();
        console.log(DRY_RUN
            ? `DRY RUN - previewing missing "${MANDATORY_MODULE_NAME}" entitlements (no changes will be made):`
            : `Ensuring every company is entitled to "${MANDATORY_MODULE_NAME}"...`);

        const mandatory = await Module.findOne({ where: { name: MANDATORY_MODULE_NAME }, attributes: ['id', 'name'] });
        if (!mandatory) {
            console.error(`  Module "${MANDATORY_MODULE_NAME}" not found - nothing to do.`);
            process.exit(1);
        }

        const companies = await Company.findAll({ attributes: ['id', 'name'] });
        const existing = await CompanyModule.findAll({
            where: { moduleId: mandatory.id },
            attributes: ['id', 'companyId', 'isActive'],
        });
        const byCompany = new Map(existing.map(cm => [cm.companyId, cm]));

        let added = 0, reactivated = 0, ok = 0;
        for (const company of companies) {
            const row = byCompany.get(company.id);
            if (!row) {
                added++;
                console.log(`  ${DRY_RUN ? 'would add' : 'adding'} entitlement for "${company.name}" (${company.id})`);
                if (!DRY_RUN) {
                    await CompanyModule.create({ companyId: company.id, moduleId: mandatory.id, isActive: true });
                }
            } else if (row.isActive === false) {
                reactivated++;
                console.log(`  ${DRY_RUN ? 'would re-activate' : 're-activating'} entitlement for "${company.name}" (${company.id})`);
                if (!DRY_RUN) {
                    row.isActive = true;
                    await row.save();
                }
            } else {
                ok++;
            }
        }

        console.log(`Done. ${companies.length} companies: ${ok} already entitled, ${added} ${DRY_RUN ? 'to add' : 'added'}, ${reactivated} ${DRY_RUN ? 'to re-activate' : 're-activated'}.`);
        process.exit(0);
    } catch (err) {
        console.error('Backfill failed:', err);
        process.exit(1);
    }
})();
