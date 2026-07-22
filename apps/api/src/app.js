// src/app.js
//
// Composition root for the modular monolith. Builds the Express app, wires the
// module routers, and owns DB bootstrap (schema sync + seeding). The root
// `server.js` is now a thin bootstrap that just calls start().
//
// Route mounting is the future API-gateway seam: each `app.use('/api/...', ...)`
// can later point at a separately deployed service without touching callers.

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables from .env file (used locally, ignored in Docker)
dotenv.config();

const { sequelize } = require('./platform/db');

// Requiring the associations module defines every model + association exactly once.
const {
    User,
    Company,
    CompanyUser,
    Module,
    Menu,
    CompanyModule,
    Role,
    RoleMenu,
} = require('./wiring/associations');

// --- Module routers ---
// Platform tier:
const authRoutes = require('./modules/identity/auth.routes');
const adminRoutes = require('./modules/saas/admin.routes');
const countryRoutes = require('./modules/saas/country.routes');
const languageRoutes = require('./modules/saas/language.routes');
const languageController = require('./modules/saas/language.controller');
const currencyRoutes = require('./modules/saas/currency.routes');
const industryTypeRoutes = require('./modules/saas/industryType.routes');
const salutationRoutes = require('./modules/saas/salutation.routes');
const nationalityRoutes = require('./modules/saas/nationality.routes');
const raceRoutes = require('./modules/saas/race.routes');
const titleRoutes = require('./modules/saas/title.routes');
const departmentRoutes = require('./modules/saas/department.routes');
const positionRoutes = require('./modules/saas/position.routes');
const publicHolidayRoutes = require('./modules/saas/publicHoliday.routes');
const weekendDayRoutes = require('./modules/saas/companyWeekendDay.routes');
// Product tier (core systems) — stubs reserving the gateway seam. See
// docs/systems/ for each service's spec and the cross-service rules.
const membershipRoutes = require('./modules/membership/membership.routes');
const golfRoutes = require('./modules/golf/golf.routes');
const facilityRoutes = require('./modules/facility/facility.routes');
// Shared financial reference (Tax) - subscriber-owned scheme catalog consumed by
// the product systems. Its own gateway seam so it can be split out later.
const taxRoutes = require('./modules/tax/tax.routes');
// Shared capability (Workflow) - user-definable approval chains consumed by the
// product systems through platform/workflowGateway.js. Own gateway seam.
const workflowRoutes = require('./modules/workflow/workflow.routes');
// Completion-handler registration (producer modules hook onto their purposes).
require('./wiring/workflowHandlers');

// --- Build the Express application ---
function createApp() {
    const app = express();

    // CORS Configuration: Allows requests from the Angular frontend.
    // Note: lock `origin` down to the deployed app URL before production.
    const corsOptions = {
        origin: '*', // For development, allow all origins
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    };

    app.use(cors(corsOptions));
    app.use(express.json());

    // Respond with "204 No Content" for favicon requests
    app.get('/favicon.ico', (req, res) => res.status(204).end());

    // --- API Routes (gateway seam) ---
    // Platform tier:
    app.use('/api/auth', authRoutes);
    app.use('/api/admin', adminRoutes);
    app.use('/api/countries', countryRoutes);
    app.use('/api/languages', languageRoutes);
    app.use('/api/currencies', currencyRoutes);
    // Subscriber-owned reference data (active lists for product pickers).
    app.use('/api/industry-types', industryTypeRoutes);
    app.use('/api/salutations', salutationRoutes);
    app.use('/api/nationalities', nationalityRoutes);
    app.use('/api/races', raceRoutes);
    app.use('/api/titles', titleRoutes);
    app.use('/api/departments', departmentRoutes);
    app.use('/api/positions', positionRoutes);
    app.use('/api/public-holidays', publicHolidayRoutes);
    app.use('/api/weekend-days', weekendDayRoutes);
    // Public (unauthenticated) active-languages list, for the login screen's
    // language switcher (no user/subscriber context exists yet before login).
    app.get('/api/public/languages', languageController.listActiveLanguages);
    // Product tier (core systems):
    app.use('/api/membership', membershipRoutes);
    app.use('/api/golf', golfRoutes);
    app.use('/api/facility', facilityRoutes);
    // Shared financial reference (Tax) - its own seam, consumed by the above.
    app.use('/api/tax', taxRoutes);
    // Shared capability (Workflow) - approval chains, its own seam.
    app.use('/api/workflow', workflowRoutes);

    // Simple Health Check Route
    app.get('/', (req, res) => {
        res.send('Login API is running!');
    });

    return app;
}

// --- Server startup (non-blocking, matches Cloud Run expectations) ---
function start() {
    const app = createApp();
    const PORT = process.env.PORT || 8080;

    // Binding to '0.0.0.0' is required for Docker / Cloud Run to route traffic.
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server is running on port ${PORT}`);
        // Once listening, attempt the DB connection in the background.
        initializeDB();
    });

    return app;
}

// --- Database Initialization with Advisory Locks ---
async function initializeDB() {
    let lockAcquired = false;

    try {
        await sequelize.authenticate();
        console.log('PostgreSQL connection established successfully.');

        // Grab the PostgreSQL Advisory Lock (ID: 999999) so only one Cloud Run
        // container syncs the schema at a time.
        console.log('Waiting for Database Sync Lock...');
        await sequelize.query('SELECT pg_advisory_lock(999999)');
        lockAcquired = true;

        // Schema-fingerprint gate: the full alter-sync is minutes of
        // information_schema interrogation, but the models only change on the
        // rare release that edits a model file. Hash the model definitions and
        // skip the sync when the stored fingerprint matches - so deploys,
        // scale-ups and cold starts settle in seconds unless the schema really
        // changed. FORCE_SCHEMA_SYNC=1 overrides (e.g. after manual DDL).
        const {
            computeSchemaFingerprint,
            readStoredFingerprint,
            writeStoredFingerprint,
        } = require('./platform/schemaFingerprint');
        const fingerprint = computeSchemaFingerprint(sequelize);
        const stored = await readStoredFingerprint(sequelize);
        const forceSync = process.env.FORCE_SCHEMA_SYNC === '1';

        if (stored === fingerprint && !forceSync) {
            console.log('Lock acquired. Database schema up to date (fingerprint match) - skipping sync.');
        } else {
            console.log(`Lock acquired. ${forceSync ? 'FORCE_SCHEMA_SYNC=1' : 'Schema fingerprint changed'} - syncing database schema...`);

            // Product-tier services own their own Postgres schema (membership, …) so
            // they can be pg_dump --schema extracted later. Create them before sync,
            // inside the lock, so the schema-scoped models have a schema to land in.
            await require('./platform/schemas').ensureProductSchemas(sequelize);

            await sequelize.sync({ alter: true });
            await writeStoredFingerprint(sequelize, fingerprint);
            console.log('Database schema synced successfully.');
        }

        // Backfill Company.countryCode from the alpha-2 the Companies picker already
        // stored in the free-text `country`, for rows created before countryCode
        // existed. Idempotent (only fills NULLs matching a 2-letter code), so it is
        // safe to run on every boot. Lets tax lookup work without a manual re-save.
        await sequelize.query(
            `UPDATE "Company" SET "countryCode" = lower("country")
             WHERE "countryCode" IS NULL AND "country" ~ '^[A-Za-z]{2}$'`,
        );

        // Ensure the platform email-template defaults exist (idempotent, always
        // runs — unlike the RUN_SEED-gated demo seeder — so emails never break).
        await require('./modules/notification/emailTemplate.service').seedPlatformDefaults();
        console.log('Email template defaults ensured.');

        await seedDatabase();

    } catch (error) {
        // Log the error but DO NOT crash the process
        console.error('Database initialization failed:', error);
    } finally {
        if (lockAcquired) {
            try {
                await sequelize.query('SELECT pg_advisory_unlock(999999)');
                console.log('Database Sync Lock released.');
            } catch (unlockError) {
                console.error('Failed to release database lock:', unlockError);
            }
        }
    }
}

// --- DATABASE SEEDER ---
// ⚠️ DESTRUCTIVE: this wipes Roles/Menus/Modules before re-creating them.
// It must NEVER run automatically on Cloud Run — each autoscaled instance boot
// would otherwise wipe runtime data. It only runs when explicitly requested via
// RUN_SEED=true (see `npm run seed`), intended for a fresh/dev database.
async function seedDatabase() {
    if (process.env.RUN_SEED !== 'true') {
        console.log('⏭️  Skipping seeder (set RUN_SEED=true to wipe + reseed).');
        return;
    }

    try {
        // 👇 WIPE BLOCK (only reached when RUN_SEED=true)
        console.log('🧹 Wiping old seed data...');
        await CompanyUser.update({ roleId: null }, { where: {} });
        await RoleMenu.destroy({ where: {} });
        await Menu.destroy({ where: {} });
        await CompanyModule.destroy({ where: {} });
        await Role.destroy({ where: {} });
        await Module.destroy({ where: {} });
        console.log('✨ Wipe complete!');
        // 👆 END WIPE BLOCK

        const moduleCount = await Module.count();
        if (moduleCount > 0) return;

        console.log('🌱 Starting Database Seeder...');

        // 1. Create Modules (Including the new SYSTEM module!)
        const coreModule = await Module.create({ name: 'Core Club Management', icon: 'business' });
        const golfModule = await Module.create({ name: 'Golf Management', icon: 'sports_golf' });
        const systemModule = await Module.create({ name: 'System Setup', icon: 'admin_panel_settings' });

        // 2. Create Menus
        const coreMenus = await Menu.bulkCreate([
            { name: 'Dashboard', route: '/home', icon: 'dashboard', moduleId: coreModule.id },
            { name: 'Facilities Setup', route: '/facilities', icon: 'domain', moduleId: coreModule.id },
            { name: 'Booking Rule Setup', route: '/booking-rules', icon: 'rule', moduleId: coreModule.id },
            { name: 'Staff Management', route: '/staff', icon: 'people', moduleId: coreModule.id }
        ]);
        const golfMenus = await Menu.bulkCreate([
            { name: 'Tee Time Setup', route: '/golf/tee-times', icon: 'sports_golf', moduleId: golfModule.id }
        ]);
        // Admin screens live under the /admin namespace (see frontend routing).
        const systemMenus = await Menu.bulkCreate([
            { name: 'Role Management', route: '/admin/roles', icon: 'badge', moduleId: systemModule.id },
            { name: 'User Management', route: '/admin/users', icon: 'manage_accounts', moduleId: systemModule.id }
        ]);

        // 3. Create SYSTEM (platform) Roles (accountId is NULL)
        const sysAdminRole = await Role.create({ accountId: null, name: 'System Admin' });
        const sysAccountRole = await Role.create({ accountId: null, name: 'Account Dept' });

        // Give System Admin access to System Menus
        await RoleMenu.bulkCreate(systemMenus.map(menu => ({ roleId: sysAdminRole.id, menuId: menu.id })));

        // 4. Setup the Test Tenant
        const testCompany = await Company.findOne();
        if (testCompany) {
            await CompanyModule.bulkCreate([
                { companyId: testCompany.id, moduleId: coreModule.id },
                { companyId: testCompany.id, moduleId: golfModule.id }
            ]);

            const tenantAdminRole = await Role.create({ accountId: testCompany.accountId, name: 'Tenant Admin' });
            const allTenantMenus = [...coreMenus, ...golfMenus];
            await RoleMenu.bulkCreate(allTenantMenus.map(m => ({ roleId: tenantAdminRole.id, menuId: m.id })));

            // Assign the test user to the Tenant Admin role
            const companyUser = await CompanyUser.findOne({ where: { companyId: testCompany.id } });
            if (companyUser) {
                companyUser.roleId = tenantAdminRole.id;
                await companyUser.save();
            }
        }

        // 5. Assign your Master Admin to the System Admin Role!
        const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim().toLowerCase()) || [];
        if (adminEmails.length > 0) {
            const masterUser = await User.findOne({ where: { email: adminEmails[0] } });
            if (masterUser) {
                // Notice companyId is null! This is a System User.
                await CompanyUser.findOrCreate({
                    where: { userId: masterUser.id, companyId: null },
                    defaults: { roleId: sysAdminRole.id }
                });
            }
        }

        console.log('🌳 Database Seeding Completed Successfully!');
    } catch (error) {
        console.error('❌ Seeding failed:', error);
    }
}

module.exports = { createApp, start, initializeDB, seedDatabase };
