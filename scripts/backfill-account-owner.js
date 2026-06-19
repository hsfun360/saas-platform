// scripts/backfill-account-owner.js
//
// One-time, idempotent backfill of Account.ownerUserId for accounts created
// before the account-owner (SuperUser) concept existed. The owner is inferred
// as the earliest "Tenant Admin" of any company under the account.
//
//   node scripts/backfill-account-owner.js
//
// Safe to re-run: it only touches accounts whose ownerUserId is still NULL.

const { sequelize } = require('../src/platform/db');
require('../src/wiring/associations'); // defines every model + association once
const Account = require('../src/modules/saas/account.model');
const Company = require('../src/modules/saas/company.model');
const CompanyUser = require('../src/modules/saas/companyUser.model');
const Role = require('../src/modules/saas/role.model');

(async () => {
    try {
        await sequelize.authenticate();

        // Ensure the column exists even if the app hasn't run sync({ alter: true }) yet.
        await sequelize.query('ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "ownerUserId" UUID;');

        const accounts = await Account.findAll({ where: { ownerUserId: null } });
        console.log(`Accounts without an owner: ${accounts.length}`);

        let fixed = 0;
        for (const account of accounts) {
            const companies = await Company.findAll({ where: { accountId: account.id }, attributes: ['id'] });
            const companyIds = companies.map(c => c.id);
            if (companyIds.length === 0) {
                console.log(`- ${account.id} (${account.subscriberName}): no companies, skipped`);
                continue;
            }

            // Earliest Tenant Admin among the account's companies = the owner.
            const adminLink = await CompanyUser.findOne({
                where: { companyId: companyIds },
                include: [{ model: Role, as: 'Role', where: { name: 'Tenant Admin' } }],
                order: [['createdAt', 'ASC']],
            });
            if (!adminLink) {
                console.log(`- ${account.id} (${account.subscriberName}): no Tenant Admin found, skipped`);
                continue;
            }

            account.ownerUserId = adminLink.userId;
            await account.save();
            fixed++;
            console.log(`- ${account.id} (${account.subscriberName}): owner -> ${adminLink.userId}`);
        }

        console.log(`Done. Backfilled ${fixed} account(s).`);
        await sequelize.close();
        process.exit(0);
    } catch (err) {
        console.error('Backfill failed:', err);
        process.exit(1);
    }
})();
