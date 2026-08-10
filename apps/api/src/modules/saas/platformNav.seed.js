// src/modules/saas/platformNav.seed.js
//
// Boot-time seed for the PLATFORM navigation: the "SaaS Administration" Module
// (audience 'platform') and its Menu tree. This replaced the hardcoded menu
// block the web shell used to inject for system admins (dashboard.ts), so the
// platform sidebar, apps switcher, favorites, recents, guides and screen titles
// all run off the same DB menus as every tenant module.
//
// Idempotent and self-healing, same philosophy as ensureSystemModules():
//   - The module is keyed by its base NAME ('SaaS Administration'), which is
//     locked like a system module's (localized `names` stay editable).
//   - Leaf menus are keyed by ROUTE (stable code-level identifiers), so a
//     rename in Modules & Menus survives reboots; a missing route is re-added.
//   - Section headers (route '') are keyed by base name.
//   - Nothing is ever deleted or re-ordered here - subscribers of this seed are
//     free to re-arrange / translate in Modules & Menus.
//
// The platform "System Admin" role has IMPLICIT full access to every platform
// menu (mirrors the Tenant Admin rule - see buildWorkspaceMenus), so it needs
// no RoleMenu rows. This seed also clears any stored grants that role
// accumulated historically (the old seed granted it the tenant "System
// Administration" menus, which is why the apps switcher used to show two
// modules for the master admin).

const Module = require('./module.model');
const Menu = require('./menu.model');
const Role = require('./role.model');
const RoleMenu = require('./roleMenu.model');

const PLATFORM_MODULE_NAME = 'SaaS Administration';

// The tree: sections carry children; every leaf's route must match the web
// app's /admin routing table (main.ts). Sequences mirror the old hardcoded nav.
const NAV_TREE = [
    { name: 'Subscriber Management', route: '/admin/subscribers', icon: 'groups', sequence: 0 },
    {
        name: 'Access', route: '', icon: 'lock', sequence: 1, children: [
            { name: 'Roles', route: '/admin/system-roles', icon: 'badge', sequence: 0 },
            { name: 'Users', route: '/admin/platform-users', icon: 'person', sequence: 1 },
            { name: 'Assign Role', route: '/admin/system-setup', icon: 'link', sequence: 2 },
            { name: 'Unverified Registrations', route: '/admin/unverified-users', icon: 'person_off', sequence: 3 },
            { name: 'Audit Log', route: '/admin/audit-log', icon: 'history', sequence: 4 },
        ],
    },
    {
        name: 'Reference data', route: '', icon: 'storage', sequence: 2, children: [
            { name: 'Countries', route: '/admin/countries', icon: 'public', sequence: 0 },
            { name: 'Languages', route: '/admin/languages', icon: 'translate', sequence: 1 },
            { name: 'Currencies', route: '/admin/currencies', icon: 'payments', sequence: 2 },
        ],
    },
    {
        name: 'Configuration', route: '', icon: 'settings', sequence: 3, children: [
            { name: 'Modules & Menus', route: '/admin/modules-menus', icon: 'category', sequence: 0 },
            { name: 'Email Templates', route: '/admin/email-templates', icon: 'mail', sequence: 1 },
            { name: 'Platform Tax', route: '/admin/platform-tax', icon: 'receipt_long', sequence: 2 },
            { name: 'Platform Profile', route: '/admin/platform-profile', icon: 'store', sequence: 3 },
        ],
    },
];

async function ensurePlatformNav() {
    const [module, created] = await Module.findOrCreate({
        where: { name: PLATFORM_MODULE_NAME },
        defaults: {
            icon: 'admin_panel_settings',
            description: 'Platform control plane - subscribers, access, reference data and configuration.',
            audience: 'platform',
        },
    });
    // Self-heal a pre-audience row (or a manually created one).
    if (module.audience !== 'platform') await module.update({ audience: 'platform' });

    const existing = await Menu.findAll({ where: { moduleId: module.id } });
    const byRoute = new Map(existing.filter((m) => m.route).map((m) => [m.route, m]));
    const byName = new Map(existing.map((m) => [m.name, m]));

    let added = 0;
    for (const node of NAV_TREE) {
        let parentId = null;
        if (node.children) {
            // Section header, keyed by base name (route is '').
            let section = byName.get(node.name);
            if (!section) {
                section = await Menu.create({
                    name: node.name, route: '', icon: node.icon,
                    moduleId: module.id, parentId: null, sequence: node.sequence,
                });
                byName.set(section.name, section);
                added++;
            }
            parentId = section.id;
        }
        const leaves = node.children || [node];
        for (const leaf of leaves) {
            if (byRoute.has(leaf.route)) continue;
            const row = await Menu.create({
                name: leaf.name, route: leaf.route, icon: leaf.icon,
                moduleId: module.id, parentId, sequence: leaf.sequence,
            });
            byRoute.set(row.route, row);
            added++;
        }
    }

    // The platform System Admin role is implicit-full-access over platform
    // menus; stored grants are dead weight (and the legacy tenant-menu grants
    // put a second module in the master admin's apps switcher). Clear them.
    const systemAdmin = await Role.findOne({ where: { accountId: null, name: 'System Admin' } });
    let cleared = 0;
    if (systemAdmin) {
        cleared = await RoleMenu.destroy({ where: { roleId: systemAdmin.id } });
    }

    if (created || added > 0 || cleared > 0) {
        console.log(`Platform nav ensured: module ${created ? 'created' : 'ok'}, ${added} menu(s) added, ${cleared} legacy System Admin grant(s) cleared.`);
    }
}

module.exports = { ensurePlatformNav, PLATFORM_MODULE_NAME };
