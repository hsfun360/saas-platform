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
            { name: 'e-Invoice Classification Codes', route: '/admin/e-invoice-classification-codes', icon: 'sell', sequence: 3 },
            { name: 'e-Invoice MSIC Codes', route: '/admin/e-invoice-msic-codes', icon: 'factory', sequence: 4 },
            { name: 'e-Invoice Tax Types', route: '/admin/e-invoice-tax-types', icon: 'percent', sequence: 5 },
            { name: 'e-Invoice Unit Types', route: '/admin/e-invoice-unit-types', icon: 'straighten', sequence: 6 },
            { name: 'e-Invoice State Codes', route: '/admin/e-invoice-state-codes', icon: 'map', sequence: 7 },
            { name: 'e-Invoice Payment Methods', route: '/admin/e-invoice-payment-methods', icon: 'credit_card', sequence: 8 },
            { name: 'e-Invoice Document Types', route: '/admin/e-invoice-document-types', icon: 'description', sequence: 9 },
        ],
    },
    {
        name: 'Configuration', route: '', icon: 'settings', sequence: 3, children: [
            // Catalogue maintenance is split per Module.audience into two
            // separately-grantable screens (one shared component).
            { name: 'Tenant Modules & Menus', route: '/admin/modules-menus', icon: 'category', sequence: 0 },
            { name: 'Platform Modules & Menus', route: '/admin/platform-menus', icon: 'dashboard_customize', sequence: 1 },
            { name: 'Email Templates', route: '/admin/email-templates', icon: 'mail', sequence: 2 },
            { name: 'Platform Tax', route: '/admin/platform-tax', icon: 'receipt_long', sequence: 3 },
            { name: 'Platform Profile', route: '/admin/platform-profile', icon: 'store', sequence: 4 },
        ],
    },
];

// One-shot renames for menus this seed created under an older name. Applied
// only while the row still carries the old seeded default, so a user's own
// rename in Modules & Menus is never overwritten. Keyed by route.
const SEED_RENAMES = [
    { route: '/admin/modules-menus', from: 'Modules & Menus', to: 'Tenant Modules & Menus' },
];

async function ensurePlatformNav() {
    // Names are unique per audience, so key on BOTH - a tenant module that
    // happens to share the name must never be hijacked into the platform shell.
    // (Pre-audience rows healed to audience 'platform' before this tightened.)
    const [module, created] = await Module.findOrCreate({
        where: { name: PLATFORM_MODULE_NAME, audience: 'platform' },
        defaults: {
            icon: 'admin_panel_settings',
            description: 'Platform control plane - subscribers, access, reference data and configuration.',
        },
    });

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

    // Apply pending seed renames (no-ops once done or after a user rename).
    for (const r of SEED_RENAMES) {
        const row = byRoute.get(r.route);
        if (row && row.name === r.from) {
            await row.update({ name: r.to });
            added++; // count it so the summary line logs the change
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
