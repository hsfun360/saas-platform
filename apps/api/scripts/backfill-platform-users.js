// scripts/backfill-platform-users.js
//
// One-time, IDEMPOTENT data migration.
//
// The old platform "create user" flow inserted a User row but no CompanyUser
// membership, leaving "orphan" accounts: no workspace (so they hit the
// "0 workspaces -> 403" path on login) and invisible to the new platform-users
// list (which keys off a system-level membership). This gives every orphan user
// a system-level membership (CompanyUser with companyId = NULL, no role, active),
// turning them into proper platform users.
//
// Safe to run multiple times - only users with NO membership at all are touched.
//
//   node scripts/backfill-platform-users.js              (apply)
//   node scripts/backfill-platform-users.js --dry-run    (preview only, no writes)
//   npm run migrate:platform-users                       (apply)

require('dotenv').config();
const { sequelize } = require('../src/platform/db');
const User = require('../src/modules/identity/user.model');
const CompanyUser = require('../src/modules/saas/companyUser.model');

const DRY_RUN = process.argv.includes('--dry-run');

(async () => {
    try {
        await sequelize.authenticate();
        console.log(DRY_RUN
            ? 'DRY RUN - previewing orphan users that would become platform users (no changes will be made):'
            : 'Backfilling system-level memberships for orphan users...');

        const users = await User.findAll({ attributes: ['id', 'email'] });
        const memberships = await CompanyUser.findAll({ attributes: ['userId'] });
        const hasMembership = new Set(memberships.map(m => m.userId));
        const orphans = users.filter(u => !hasMembership.has(u.id));

        if (orphans.length === 0) {
            console.log('✅ Nothing to backfill (no orphan users).');
            process.exit(0);
        }

        for (const u of orphans) {
            console.log(`  ${DRY_RUN ? 'would add' : 'adding'} system membership  ->  ${u.email}`);
        }

        if (DRY_RUN) {
            console.log(`ℹ️  Dry run: ${orphans.length} user(s) would be backfilled. Re-run without --dry-run to apply.`);
        } else {
            await CompanyUser.bulkCreate(
                orphans.map(u => ({ userId: u.id, companyId: null, roleId: null, isActive: true })),
            );
            console.log(`✅ Done. Backfilled ${orphans.length} platform user(s).`);
        }
        process.exit(0);
    } catch (err) {
        console.error('❌ Backfill failed:', err);
        process.exit(1);
    }
})();
