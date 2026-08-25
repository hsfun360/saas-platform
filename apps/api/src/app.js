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
const eInvoiceClassificationCodeRoutes = require('./modules/saas/eInvoiceClassificationCode.routes');
const eInvoiceMsicCodeRoutes = require('./modules/saas/eInvoiceMsicCode.routes');
const eInvoiceTaxTypeRoutes = require('./modules/saas/eInvoiceTaxType.routes');
const eInvoiceUnitTypeRoutes = require('./modules/saas/eInvoiceUnitType.routes');
const eInvoiceStateCodeRoutes = require('./modules/saas/eInvoiceStateCode.routes');
const eInvoicePaymentMethodRoutes = require('./modules/saas/eInvoicePaymentMethod.routes');
const eInvoiceDocumentTypeRoutes = require('./modules/saas/eInvoiceDocumentType.routes');
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
// Account Receivable - the open-item debtor ledger every product posts charges
// into (via platform/arGateway.js). Own gateway seam like any product service.
const arRoutes = require('./modules/ar/ar.routes');
const dimensionRoutes = require('./modules/dimension/dimension.routes');
// Completion-handler registration (producer modules hook onto their purposes).
require('./wiring/workflowHandlers');
// Consumers register their Dimension usage checks (the repurpose lock).
require('./wiring/dimensionUsage');

// --- Build the Express application ---
function createApp() {
    const app = express();

    // Cloud Run sits behind Google's front end, which appends the real client
    // IP as the LAST X-Forwarded-For entry. Trusting exactly ONE hop makes
    // req.ip resolve to that entry (earlier entries are client-supplied junk),
    // which the per-IP rate limiters key on. Do not raise this blindly.
    app.set('trust proxy', 1);

    // CORS: locked to the deployed frontend (FRONTEND_BASE_URL) plus the local
    // dev servers. Not real protection against scripts (curl has no origin) -
    // it stops drive-by abuse from other people's web pages.
    //
    // The production domain is listed explicitly so cross-origin requests keep
    // working during the domain cutover (before the app is served same-origin
    // behind the load balancer). Once same-origin, the app's own requests carry
    // no cross-origin preflight anyway; these entries are then belt-and-braces.
    const allowedOrigins = [
        process.env.FRONTEND_BASE_URL,
        'https://www.myeasysoft.com',
        'https://myeasysoft.com',
        'http://localhost:4200',
        'http://localhost:4300',
    ].filter(Boolean);
    const corsOptions = {
        origin: allowedOrigins,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        // The refresh-token cookie is cross-origin (web app and API are
        // different origins), so credentialed requests must be allowed -
        // which is also why `origin` can never be '*' again.
        credentials: true,
    };

    app.use(cors(corsOptions));
    // Refresh-token cookie (path-scoped to /api/auth; see session.service.js).
    app.use(require('cookie-parser')());
    // Audit who-context (verified identity + ip + requestId on AsyncLocalStorage)
    // so the global audit hooks can attribute every DB change to its request.
    app.use(require('./platform/auditContext').auditContextMiddleware);
    // Per-request memoization of Control-Plane facts (company basics,
    // entitlements) - serviceContext helpers share one query per request.
    app.use(require('./platform/serviceContext').requestContextMiddleware);
    // Explicit JSON body cap (matches the express default, stated on purpose):
    // no JSON endpoint needs more; file uploads (avatars, membership import
    // Excel) go through multer with their own limits, not this parser.
    app.use(express.json({ limit: '100kb' }));

    // Respond with "204 No Content" for favicon requests
    app.get('/favicon.ico', (req, res) => res.status(204).end());

    // --- API Routes (gateway seam) ---
    // Platform tier:
    app.use('/api/auth', authRoutes);
    app.use('/api/admin', adminRoutes);
    app.use('/api/countries', countryRoutes);
    app.use('/api/languages', languageRoutes);
    app.use('/api/currencies', currencyRoutes);
    app.use('/api/e-invoice-classification-codes', eInvoiceClassificationCodeRoutes);
    app.use('/api/e-invoice-msic-codes', eInvoiceMsicCodeRoutes);
    app.use('/api/e-invoice-tax-types', eInvoiceTaxTypeRoutes);
    app.use('/api/e-invoice-unit-types', eInvoiceUnitTypeRoutes);
    app.use('/api/e-invoice-state-codes', eInvoiceStateCodeRoutes);
    app.use('/api/e-invoice-payment-methods', eInvoicePaymentMethodRoutes);
    app.use('/api/e-invoice-document-types', eInvoiceDocumentTypeRoutes);
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
    // Account Receivable - the debtor ledger, its own seam.
    app.use('/api/ar', arRoutes);
    // Shared Dimension capability (financial-analysis dimensions, 2026-08-25).
    app.use('/api/dimension', dimensionRoutes);
    // In-app notifications (the header bell) - Notification service, user-scoped.
    app.use('/api/notifications', require('./modules/notification/notification.routes'));

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

            // Statement print-completeness migration (2026-08-06) - BEFORE the
            // alter-sync, so it sees the renamed table/columns instead of
            // creating fresh empty ones. Idempotent via to_regclass /
            // information_schema guards; a fresh DB skips it entirely.
            //
            // 1. ar.StatementLine -> ar.StatementDetail (+ txnDate -> docDate,
            //    index renames - rows and counters preserved).
            const [[stLine]] = await sequelize.query(
                `SELECT to_regclass('ar."StatementLine"') AS o, to_regclass('ar."StatementDetail"') AS n`,
            );
            if (stLine && stLine.o && !stLine.n) {
                await sequelize.query('ALTER TABLE ar."StatementLine" RENAME TO "StatementDetail"');
                await sequelize.query('ALTER TABLE ar."StatementDetail" RENAME COLUMN "txnDate" TO "docDate"');
                await sequelize.query('ALTER INDEX IF EXISTS ar."IDX_StatementLine_Statement_Line" RENAME TO "IDX_StatementDetail_Statement_Line"');
                await sequelize.query('ALTER INDEX IF EXISTS ar."IDX_StatementLine_Company" RENAME TO "IDX_StatementDetail_Company"');
                console.log('Migrated ar.StatementLine -> ar.StatementDetail.');
            }
            // 2. ar.Statement NOT NULL snapshot columns whose backfill needs
            //    data the alter-sync cannot derive (month from periodEnd,
            //    debtor type/category via joins, issuer name from Company).
            const [[stTable]] = await sequelize.query(`SELECT to_regclass('ar."Statement"') AS t`);
            if (stTable && stTable.t) {
                const [stCols] = await sequelize.query(
                    `SELECT column_name FROM information_schema.columns
                     WHERE table_schema = 'ar' AND table_name = 'Statement'`,
                );
                const have = new Set(stCols.map((c) => c.column_name));
                if (!have.has('statementMonth')) {
                    await sequelize.query('ALTER TABLE ar."Statement" ADD COLUMN "statementMonth" DATE');
                    await sequelize.query(`UPDATE ar."Statement" SET "statementMonth" = date_trunc('month', "periodEnd")::date`);
                    await sequelize.query('ALTER TABLE ar."Statement" ALTER COLUMN "statementMonth" SET NOT NULL');
                }
                if (!have.has('debtorType')) {
                    await sequelize.query('ALTER TABLE ar."Statement" ADD COLUMN "debtorType" VARCHAR(20)');
                    await sequelize.query(
                        `UPDATE ar."Statement" s SET "debtorType" = d."debtorType"
                         FROM ar."Debtor" d WHERE s."debtorId" = d."id"`,
                    );
                    await sequelize.query(`UPDATE ar."Statement" SET "debtorType" = 'other' WHERE "debtorType" IS NULL`);
                    await sequelize.query('ALTER TABLE ar."Statement" ALTER COLUMN "debtorType" SET NOT NULL');
                }
                if (!have.has('debtorCategory')) {
                    await sequelize.query('ALTER TABLE ar."Statement" ADD COLUMN "debtorCategory" VARCHAR(20)');
                    await sequelize.query(
                        `UPDATE ar."Statement" s SET "debtorCategory" = CASE
                             WHEN d."debtorType" = 'other' THEN 'other'
                             WHEN d."debtorType" = 'membership' THEN COALESCE(m."membershipClass", 'individual')
                             WHEN d."debtorType" = 'member' THEN CASE WHEN mem."memberKind" = 'nominee' THEN 'nominee' ELSE 'individual' END
                             ELSE 'other' END
                         FROM ar."Debtor" d
                         LEFT JOIN membership."Membership" m ON d."debtorType" = 'membership' AND m."id" = d."sourceId"
                         LEFT JOIN membership."Member" mem ON d."debtorType" = 'member' AND mem."id" = d."sourceId"
                         WHERE s."debtorId" = d."id"`,
                    );
                    await sequelize.query(`UPDATE ar."Statement" SET "debtorCategory" = 'other' WHERE "debtorCategory" IS NULL`);
                    await sequelize.query('ALTER TABLE ar."Statement" ALTER COLUMN "debtorCategory" SET NOT NULL');
                }
                if (!have.has('companyName')) {
                    await sequelize.query('ALTER TABLE ar."Statement" ADD COLUMN "companyName" VARCHAR(255)');
                    await sequelize.query(
                        `UPDATE ar."Statement" s SET "companyName" = c."name"
                         FROM public."Company" c WHERE s."companyId" = c."id"`,
                    );
                    await sequelize.query(`UPDATE ar."Statement" SET "companyName" = '' WHERE "companyName" IS NULL`);
                    await sequelize.query('ALTER TABLE ar."Statement" ALTER COLUMN "companyName" SET NOT NULL');
                }
                // The pre-overwrite era skipped re-runs by EXACT periodEnd, so
                // two runs with different end dates in the same month could
                // leave two LIVE statements for one debtor+month - which would
                // abort the sync when it builds the partial unique index. Void
                // every older duplicate, keeping the newest live statement per
                // (company, debtor, month). Idempotent (no-op once clean).
                await sequelize.query(
                    `UPDATE ar."Statement" s SET status = 'void'
                     WHERE s.status <> 'void' AND EXISTS (
                         SELECT 1 FROM ar."Statement" n
                         WHERE n."companyId" = s."companyId"
                           AND n."debtorId" = s."debtorId"
                           AND n."statementMonth" = s."statementMonth"
                           AND n.status <> 'void'
                           AND (n."createdAt" > s."createdAt"
                                OR (n."createdAt" = s."createdAt" AND n.id > s.id)))`,
                );
            }

            // Invoice numbering firmed up 2026-08-14: docNo returns to NOT
            // NULL (numbers issue at SAVE inside the draft's transaction).
            // Any draft created during the brief nullable window gets a
            // synthetic reference so the SET NOT NULL alter cannot abort.
            await sequelize.query(
                `UPDATE ar."Ledger"
                 SET "docNo" = 'DRAFT-' || UPPER(SUBSTRING(id::text, 1, 8))
                 WHERE "docNo" IS NULL`,
            ).catch((err) => console.warn('Ledger draft docNo backfill skipped:', err.message));

            // balanceAmount rename (user decision 2026-08-24): ar.Ledger stores
            // the REMAINING balance (gross at creation, reduced to 0 by
            // allocations) instead of the allocated-so-far settledAmount. The
            // value must be converted BEFORE the alter-sync drops the old
            // column. Idempotent; skipped entirely once settledAmount is gone.
            const [[ledgerCols]] = await sequelize.query(
                `SELECT
                    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'ar' AND table_name = 'Ledger' AND column_name = 'settledAmount') AS has_old,
                    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'ar' AND table_name = 'Ledger' AND column_name = 'balanceAmount') AS has_new`,
            ).catch(() => [[null]]);
            if (ledgerCols && ledgerCols.has_old) {
                if (!ledgerCols.has_new) {
                    await sequelize.query('ALTER TABLE ar."Ledger" ADD COLUMN "balanceAmount" numeric(21,2)');
                }
                await sequelize.query(
                    `UPDATE ar."Ledger" SET "balanceAmount" = "grossAmount" - "settledAmount"
                     WHERE "balanceAmount" IS NULL`,
                );
            }
            // Same flip for the money-movement tables (user decision
            // 2026-08-24): Receipt.allocatedAmount -> balanceAmount (the
            // unallocated / unfunded remainder), Deposit.collectedAmount /
            // utilizedAmount -> balanceAmount (still to collect) + heldAmount
            // (held balance).
            const [[receiptCols]] = await sequelize.query(
                `SELECT
                    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'ar' AND table_name = 'Receipt' AND column_name = 'allocatedAmount') AS has_old,
                    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'ar' AND table_name = 'Receipt' AND column_name = 'balanceAmount') AS has_new`,
            ).catch(() => [[null]]);
            if (receiptCols && receiptCols.has_old) {
                if (!receiptCols.has_new) {
                    await sequelize.query('ALTER TABLE ar."Receipt" ADD COLUMN "balanceAmount" numeric(21,2)');
                }
                await sequelize.query(
                    `UPDATE ar."Receipt" SET "balanceAmount" = "amount" - "allocatedAmount"
                     WHERE "balanceAmount" IS NULL`,
                );
            }
            // Dimension vocabulary alignment (user decision 2026-08-25):
            // DimensionCategory.slotNo -> dimensionNo, matching the on-screen
            // 'Analysis Dimension' wording. Values must be copied BEFORE the
            // alter-sync drops the old column. Idempotent; skipped once gone.
            const [[dimCols]] = await sequelize.query(
                `SELECT
                    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'dimension' AND table_name = 'DimensionCategory' AND column_name = 'slotNo') AS has_old,
                    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'dimension' AND table_name = 'DimensionCategory' AND column_name = 'dimensionNo') AS has_new`,
            ).catch(() => [[null]]);
            if (dimCols && dimCols.has_old) {
                if (!dimCols.has_new) {
                    await sequelize.query('ALTER TABLE dimension."DimensionCategory" ADD COLUMN "dimensionNo" integer');
                }
                await sequelize.query(
                    `UPDATE dimension."DimensionCategory" SET "dimensionNo" = "slotNo"
                     WHERE "dimensionNo" IS NULL AND "slotNo" IS NOT NULL`,
                );
            }
            const [[depositCols]] = await sequelize.query(
                `SELECT
                    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'ar' AND table_name = 'Deposit' AND column_name = 'collectedAmount') AS has_old,
                    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'ar' AND table_name = 'Deposit' AND column_name = 'balanceAmount') AS has_new`,
            ).catch(() => [[null]]);
            if (depositCols && depositCols.has_old) {
                if (!depositCols.has_new) {
                    await sequelize.query('ALTER TABLE ar."Deposit" ADD COLUMN "balanceAmount" numeric(21,2)');
                    await sequelize.query('ALTER TABLE ar."Deposit" ADD COLUMN "heldAmount" numeric(21,2)');
                }
                await sequelize.query(
                    `UPDATE ar."Deposit" SET
                        "balanceAmount" = COALESCE("balanceAmount", "amount" - "collectedAmount"),
                        "heldAmount" = COALESCE("heldAmount", "collectedAmount" - "utilizedAmount")
                     WHERE "balanceAmount" IS NULL OR "heldAmount" IS NULL`,
                );
            }

            await sequelize.sync({ alter: true });

            // Multicurrency step 2 (2026-08-21): every ledger account carries
            // its currency. Accounts from before the column existed are in the
            // company base currency by definition - stamp it once (NULLs only;
            // companies without a default currency stay NULL = base, and get
            // stamped the first boot after one is set). Idempotent.
            await sequelize.query(
                `UPDATE ar."Debtor" d SET "currencyCode" = UPPER(c."defaultCurrencyCode")
                 FROM public."Company" c
                 WHERE d."companyId" = c."id" AND d."currencyCode" IS NULL
                   AND c."defaultCurrencyCode" IS NOT NULL`,
            ).catch((err) => console.warn('Debtor currency backfill skipped:', err.message));
            await sequelize.query(
                `UPDATE ar."OtherDebtor" o SET "currencyCode" = UPPER(c."defaultCurrencyCode")
                 FROM public."Company" c
                 WHERE o."companyId" = c."id" AND o."currencyCode" IS NULL
                   AND c."defaultCurrencyCode" IS NOT NULL`,
            ).catch((err) => console.warn('OtherDebtor currency backfill skipped:', err.message));

            // Multicurrency step 3 (2026-08-21): every document carries its
            // account currency + frozen rate + base equivalents. Pre-existing
            // rows: currency from the account (falling back to the company
            // default), and base-currency rows get rate 1 + base == amounts.
            // Foreign-currency rows from before the rate existed keep a NULL
            // rate - they resolve at re-save / posting. Idempotent.
            for (const [table, baseCols] of [
                ['Ledger', '"baseNetAmount" = x."netAmount", "baseTaxAmount" = x."taxAmount", "baseGrossAmount" = x."grossAmount"'],
                ['Receipt', '"baseAmount" = x."amount"'],
                ['Deposit', '"baseAmount" = x."amount"'],
            ]) {
                await sequelize.query(
                    `UPDATE ar."${table}" x SET "currencyCode" = COALESCE(d."currencyCode", UPPER(c."defaultCurrencyCode"))
                     FROM ar."Debtor" d JOIN public."Company" c ON c."id" = d."companyId"
                     WHERE x."debtorId" = d."id" AND x."currencyCode" IS NULL
                       AND COALESCE(d."currencyCode", c."defaultCurrencyCode") IS NOT NULL`,
                ).catch((err) => console.warn(`${table} currency backfill skipped:`, err.message));
                await sequelize.query(
                    `UPDATE ar."${table}" x SET "exchangeRate" = 1, ${baseCols}
                     FROM public."Company" c
                     WHERE x."companyId" = c."id" AND x."exchangeRate" IS NULL
                       AND x."currencyCode" = UPPER(c."defaultCurrencyCode")`,
                ).catch((err) => console.warn(`${table} base-rate backfill skipped:`, err.message));
            }

            // Statement letterhead completion (2026-08-11): statements now
            // snapshot the issuer registration number at generation; backfill
            // rows from before the column existed with the CURRENT company
            // value (best available - the data columns stay frozen).
            await sequelize.query(
                `UPDATE ar."Statement" s SET "companyRegistrationNo" = c."registrationNumber"
                 FROM public."Company" c
                 WHERE s."companyId" = c."id" AND s."companyRegistrationNo" IS NULL
                   AND c."registrationNumber" IS NOT NULL`,
            ).catch((err) => console.warn('Statement registrationNo backfill skipped:', err.message));

            // Transaction Type catalog moved to AR (2026-08-15, user decision:
            // AR owns the billing/receipting catalog; membership consumes it
            // through arGateway). One-shot, guarded by the OLD table's
            // existence; ids are PRESERVED so every reference (posted Ledger
            // rows, standing charges by code, fee masters) stays valid.
            const [[oldTxnTable]] = await sequelize.query(
                `SELECT to_regclass('membership."TransactionType"') AS t`,
            );
            if (oldTxnTable && oldTxnTable.t) {
                // 1. Copy id-preserving. trxClass: seeded INTEREST -> interest,
                //    DEPCONV -> credit-note, everything else was a billing item
                //    -> invoice. All copied rows open to membership (they were
                //    membership's catalog).
                await sequelize.query(
                    `INSERT INTO ar."TransactionType"
                        (id, "companyId", "transactionType", "trxClass", description,
                         "taxSchemeCode", "isInterestChargeable", "usableInModules",
                         "isEInvoice", "eInvoiceClassificationCode", "isActive",
                         "createdBy", "createdByDepartmentId", "updatedBy", "createdAt", "updatedAt")
                     SELECT id, "companyId", "transactionType",
                            CASE "transactionType"
                                WHEN 'INTEREST' THEN 'interest'
                                WHEN 'DEPCONV' THEN 'credit-note'
                                ELSE 'invoice'
                            END,
                            description, "taxSchemeCode", "isInterestChargeable",
                            '["membership"]'::jsonb, false, NULL, "isActive",
                            "createdBy", "createdByDepartmentId", "updatedBy", "createdAt", "updatedAt"
                     FROM membership."TransactionType" o
                     WHERE NOT EXISTS (SELECT 1 FROM ar."TransactionType" n WHERE n.id = o.id)`,
                );
                // 2. Fee masters now reference their type EXPLICITLY - seed each
                //    company's fees with the old auto-pick (first active
                //    membership-fee-category type) so fee runs keep working.
                await sequelize.query(
                    `UPDATE membership."MembershipFee" f
                     SET "transactionTypeId" = (
                         SELECT o.id FROM membership."TransactionType" o
                         WHERE o."companyId" = f."companyId"
                           AND o."chargeType" = 'membership-fee' AND o."isActive"
                         ORDER BY o."transactionType" LIMIT 1)
                     WHERE f."transactionTypeId" IS NULL`,
                );
                // 3. Companies already billing through AR keep doing so:
                //    integration ON where fee runs exist (creating the Setting
                //    row when the company never opened AR Specification);
                //    designated types from the copied seeded rows.
                await sequelize.query(
                    `INSERT INTO ar."Setting" (id, "companyId", "membershipIntegration", "createdAt", "updatedAt")
                     SELECT gen_random_uuid(), b."companyId", true, now(), now()
                     FROM (SELECT DISTINCT "companyId" FROM membership."BillingSchedule") b
                     WHERE NOT EXISTS (SELECT 1 FROM ar."Setting" s WHERE s."companyId" = b."companyId")`,
                );
                await sequelize.query(
                    `UPDATE ar."Setting" s SET "membershipIntegration" = true
                     WHERE EXISTS (SELECT 1 FROM membership."BillingSchedule" b WHERE b."companyId" = s."companyId")`,
                );
                await sequelize.query(
                    `UPDATE ar."Setting" s
                     SET "interestTransactionTypeId" = (SELECT id FROM ar."TransactionType" t WHERE t."companyId" = s."companyId" AND t."transactionType" = 'INTEREST')
                     WHERE s."interestTransactionTypeId" IS NULL`,
                );
                await sequelize.query(
                    `UPDATE ar."Setting" s
                     SET "depositConversionTransactionTypeId" = (SELECT id FROM ar."TransactionType" t WHERE t."companyId" = s."companyId" AND t."transactionType" = 'DEPCONV')
                     WHERE s."depositConversionTransactionTypeId" IS NULL`,
                );
                // 4. Drop the old table (user decision: immediately after the
                //    verified copy - same-transactionless boot, copy above ran).
                await sequelize.query('DROP TABLE membership."TransactionType"');
                console.log('Transaction Type catalog migrated to ar."TransactionType" (old membership table dropped).');
            }

            await writeStoredFingerprint(sequelize, fingerprint);
            console.log('Database schema synced successfully.');
        }

        // Numbering split migration (2026-08-05): copy schemes from the retired
        // Control-Plane table into the per-module tables by purpose. Idempotent
        // (NOT EXISTS on companyId+purpose, counters copied mid-sequence) and
        // skipped entirely on a fresh DB where the old table never existed.
        const [[oldNumbering]] = await sequelize.query(
            `SELECT to_regclass('public."NumberingScheme"') AS t`,
        );
        if (oldNumbering && oldNumbering.t) {
            const copyCols = '"id","companyId","purpose","mode","prefix","format","seqPadLength","startingNumber","currentNumber","resetRule","currentPeriod","isActive","createdAt","updatedAt"';
            await sequelize.query(
                `INSERT INTO membership."NumberingScheme" (${copyCols})
                 SELECT ${copyCols} FROM public."NumberingScheme" o
                 WHERE o."purpose" NOT LIKE 'ar-%'
                   AND NOT EXISTS (SELECT 1 FROM membership."NumberingScheme" n
                                   WHERE n."companyId" = o."companyId" AND n."purpose" = o."purpose")`,
            );
            await sequelize.query(
                `INSERT INTO ar."NumberingScheme" (${copyCols})
                 SELECT ${copyCols} FROM public."NumberingScheme" o
                 WHERE o."purpose" LIKE 'ar-%'
                   AND NOT EXISTS (SELECT 1 FROM ar."NumberingScheme" n
                                   WHERE n."companyId" = o."companyId" AND n."purpose" = o."purpose")`,
            );
        }

        // Backfill Company.countryCode from the alpha-2 the Companies picker already
        // stored in the free-text `country`, for rows created before countryCode
        // existed. Idempotent (only fills NULLs matching a 2-letter code), so it is
        // safe to run on every boot. Lets tax lookup work without a manual re-save.
        await sequelize.query(
            `UPDATE "Company" SET "countryCode" = lower("country")
             WHERE "countryCode" IS NULL AND "country" ~ '^[A-Za-z]{2}$'`,
        );

        // Module names are unique PER AUDIENCE since 2026-08-10 (the tenant and
        // platform catalogues may reuse a name, e.g. "Account Receivable").
        // Drop every legacy single-column unique on Modules.name — plural
        // because historic sequelize alter runs are known to duplicate unique
        // constraints — the model's composite UX_Module_name_audience replaces
        // them. Idempotent: no-op once none remain.
        await sequelize.query(`
            DO $$
            DECLARE c record;
            BEGIN
                FOR c IN
                    SELECT con.conname
                    FROM pg_constraint con
                    JOIN pg_class t ON t.oid = con.conrelid
                    WHERE t.relname = 'Modules' AND con.contype = 'u'
                      AND (SELECT array_agg(att.attname::text ORDER BY att.attname)
                           FROM unnest(con.conkey) k
                           JOIN pg_attribute att ON att.attrelid = t.oid AND att.attnum = k) = ARRAY['name']::text[]
                LOOP
                    EXECUTE format('ALTER TABLE "Modules" DROP CONSTRAINT %I', c.conname);
                END LOOP;
            END $$;
        `);

        // Ensure the platform email-template defaults exist (idempotent, always
        // runs — unlike the RUN_SEED-gated demo seeder — so emails never break).
        await require('./modules/notification/emailTemplate.service').seedPlatformDefaults();
        console.log('Email template defaults ensured.');

        // Stamp the system modules (Module.isSystem) — idempotent, keyed by
        // name, so the mandatory-entitlement rule survives a fresh DB or a
        // row created before the flag existed.
        await require('./modules/saas/provisioning.service').ensureSystemModules();

        // Ensure the platform "SaaS Administration" Module + Menu tree exists
        // (idempotent) and clear the master role's legacy grants - the platform
        // shell is DB-menu-driven like every tenant module.
        await require('./modules/saas/platformNav.seed').ensurePlatformNav();

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
