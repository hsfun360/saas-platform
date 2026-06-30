// scripts/migrate-account-roles-finalize.js
//
// PHASE 4 (run ONCE, AFTER the Phase 3 account-role code is deployed and
// migrate-account-roles.js has backfilled Role.accountId):
//   Merges same-named roles within an account into a single role:
//     - unions their menu grants onto the keeper (oldest role),
//     - repoints CompanyUser.roleId and Invitation.roleId to the keeper,
//     - deletes the duplicate roles.
//
// This collapses the legacy per-company "Tenant Admin" roles (and any other
// duplicates) into one account-level role each. It does NOT drop the legacy
// `companyId` column — that's left as a harmless, unused column and can be
// removed later together with a role.model.js change.
//
//   node scripts/migrate-account-roles-finalize.js
//
// Idempotent: re-running after a successful merge is a no-op (no duplicates left).

const { sequelize } = require('../src/platform/db');
require('../src/wiring/associations');
const Role = require('../src/modules/saas/role.model');
const RoleMenu = require('../src/modules/saas/roleMenu.model');
const CompanyUser = require('../src/modules/saas/companyUser.model');
const Invitation = require('../src/modules/saas/invitation.model');

(async () => {
    const transaction = await sequelize.transaction();
    try {
        await sequelize.authenticate();

        const roles = await Role.findAll({ transaction });

        // Group by accountId + name (only roles that have been backfilled).
        const groups = new Map();
        for (const r of roles) {
            if (!r.accountId) continue;
            const key = `${r.accountId}||${r.name}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(r);
        }

        let mergedGroups = 0;
        let deletedRoles = 0;
        for (const [, list] of groups) {
            if (list.length <= 1) continue;
            // Keep the oldest as the canonical role.
            list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            const keeper = list[0];
            const dups = list.slice(1);

            // Menu ids the keeper already grants.
            const keeperMenus = await RoleMenu.findAll({ where: { roleId: keeper.id }, attributes: ['menuId'], transaction });
            const have = new Set(keeperMenus.map(m => m.menuId));

            for (const dup of dups) {
                const dupMenus = await RoleMenu.findAll({ where: { roleId: dup.id }, attributes: ['menuId'], transaction });
                const toAdd = dupMenus.map(m => m.menuId).filter(id => !have.has(id));
                if (toAdd.length) {
                    await RoleMenu.bulkCreate(toAdd.map(menuId => ({ roleId: keeper.id, menuId })), { transaction });
                    toAdd.forEach(id => have.add(id));
                }
                await RoleMenu.destroy({ where: { roleId: dup.id }, transaction });

                // Repoint assignments + invitations to the keeper.
                await CompanyUser.update({ roleId: keeper.id }, { where: { roleId: dup.id }, transaction });
                await Invitation.update({ roleId: keeper.id }, { where: { roleId: dup.id }, transaction });

                await dup.destroy({ transaction });
                deletedRoles++;
            }
            mergedGroups++;
        }

        await transaction.commit();
        console.log(`Merged ${mergedGroups} duplicate group(s); deleted ${deletedRoles} duplicate role(s).`);
        await sequelize.close();
        process.exit(0);
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback();
        console.error('migrate-account-roles-finalize failed:', error);
        process.exit(1);
    }
})();
