// scripts/migrate-menu-routes.js
//
// One-time, IDEMPOTENT data migration for Stage 2 of the per-system-dashboard
// work: the Angular app moved admin/account screens from the legacy `/dashboard/*`
// paths to top-level namespaces (`/admin/*`, `/home`, `/profile`, `/settings`).
// Existing Menu rows (granted to roles) still carry the old routes, so the sidebar
// links would 404. This rewrites them to the new routes.
//
// Safe to run multiple times (only rows still on an old route are touched). It does
// NOT touch product/placeholder routes (/facilities, /booking-rules, /golf/*, …).
//
//   node scripts/migrate-menu-routes.js      (or: npm run migrate:menu-routes)

require('dotenv').config();
const { sequelize } = require('../src/platform/db');
const Menu = require('../src/modules/saas/menu.model');

// old route -> new route
const ROUTE_MAP = {
    '/dashboard/roles': '/admin/roles',
    '/dashboard/users': '/admin/users',
    '/dashboard/companies': '/admin/companies',
    '/dashboard/system-setup': '/admin/system-setup',
    '/dashboard/modules-menus': '/admin/modules-menus',
    '/dashboard/profile': '/profile',
    '/dashboard/settings': '/settings',
    '/dashboard/home': '/home',
    '/dashboard': '/home',
};

(async () => {
    try {
        await sequelize.authenticate();
        console.log('Migrating legacy /dashboard/* menu routes…');

        let total = 0;
        for (const [oldRoute, newRoute] of Object.entries(ROUTE_MAP)) {
            const [count] = await Menu.update(
                { route: newRoute },
                { where: { route: oldRoute } },
            );
            if (count > 0) console.log(`  ${oldRoute}  ->  ${newRoute}   (${count} row(s))`);
            total += count;
        }

        console.log(total > 0 ? `✅ Done. Updated ${total} menu route(s).` : '✅ Nothing to migrate (already up to date).');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
})();
