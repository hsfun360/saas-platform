# SaaS Platform - Architecture & Conventions

> Status: LIVING.
> This is the umbrella doc for how the whole platform fits together.
> Per-service detail lives in the sibling files; see [README.md](README.md).

## What this platform is

A multi-tenant SaaS for clubs.
A **subscriber** (Account) has one or more **Companies** (tenants); each company subscribes to **Modules** (product systems) and grants **Roles** (RBAC) to its users.
On top of that platform run the **core product systems**: Membership, Golf, Facility and Account Receivable, plus the shared capabilities Tax, Dimension and Workflow.

## Deployed services

Three Cloud Run services, two images (`login-*` was decommissioned 2026-08-01):

- `platform-web` - the Angular SPA behind nginx, which also reverse-proxies `/api` to the API.
- `platform-api` - this repository's `server.js` (Express, Node 20).
- `platform-api-outboxworker` - the same image with the command overridden to `outboxworker.js`; it drains the transactional outbox and runs the time-driven scans (see [notification.md](notification.md)).

## Service topology

```
                         +--------------------------+
   Angular SPA  -------->        API Gateway        |  (single environment.apiUrl)
   (one app)             +--------------------------+
                              |      |      |      |
        +---------------------+      |      |      +--------------------+
        v                            v      v                           v
  Identity / Auth            System Admin / Control Plane          Core systems
  (owns User, mints JWT)     (owns Account, Company, Role,         Membership . Golf
        |                     Module, Menu, subscriptions)         . Facility . AR
        |                            ^      ^                      (own schemas)
        |  JWT (RS256, public key)   |      | entitlement + context |
        +----------------------------+------+------------------------+
                         Notification (outbox -> email; Pub/Sub later)
                  Shared capabilities: Tax . Dimension . Workflow
```

- **Platform tier**: Identity/Auth, System Administration (Control Plane), Notification.
  Cross-cutting; the product systems depend on them.
- **Product tier**: Membership, Golf, Facility, Account Receivable - the core systems.
  Each owns its own data and (eventually) its own database and deployment.
- **Shared capability tier**: Tax, Dimension, Workflow - owned by no product, consumed by several through their own gateway seams.

## How services talk to each other

Implemented through one seam: **`src/platform/serviceContext.js`** plus the per-service **`src/platform/*Gateway.js`** files.
Today everything runs in-process (monolith); when a service is split out, only these files' internals change to HTTP / signed claims - callers are untouched.

- **Who is calling** -> `getUserContext(req)` returns `{ userId, email, companyId, isSystemAdmin }` from the **verified JWT**.
  Identity is the source of truth; every service just verifies the token with the shared **public key** (RS256).
  No service calls Identity to authenticate a request.
- **Are they entitled** -> `requireModule('<Module.code>')` middleware: the active company must be subscribed to the module with that FROZEN code (`MEMBERSHIP`, `GOLF`, `FACILITY`, `AR`, `TENANT_ADMIN`, `PLATFORM_ADMIN`; Control-Plane owned).
  Codes, never display names - a rename in Modules & Menus must not change what anyone is entitled to.
  Today an in-process lookup over the per-request memoized module catalogue; later a Control-Plane API call or a signed entitlements claim.
  `companyHasModule(companyId, code)` is the non-middleware form screens use to trim cross-module controls.
- **May they perform this action** -> `requireMenuAction('<screen route>')` middleware (RBAC): the caller's role must hold a grant to the screen (`Menu.route`), and the HTTP method maps to the granted action flag (GET view / POST create / PUT+PATCH edit / DELETE delete - `RoleMenu.canCreate/canEdit/canDelete`).
  Tenant Admin and platform admins bypass; a route not in the Menu catalogue enforces nothing.
  `requireAnyMenuAction(routes[])` is the variant for endpoints shared by several screens, and `holdsMenu(req, route)` the in-handler check for one field gated on another screen's grant.
  Every product route group MUST wire this beside `requireModule` (reference: `modules/membership/membership.routes.js`).
- **Whose records may they amend** -> the data-scope helpers (`getAccessContext`, `getCallerPlacement`, `canModifyRecord`, `annotateCanModify`): a role's `dataScope` (`own` / `department` / `all`) bounds Edit/Delete against the record's ownership stamps (`createdBy`, `createdByDepartmentId`; every save also stamps `updatedBy`).
  The department rule is same-department AND strictly-senior (`Position.rank`).
  Controllers enforce with `canModifyRecord()` on update paths, stamp on create, and return a per-row `canModify` (from `annotateCanModify()`) so the UI hides actions the caller cannot use.
  Full rule + reference implementation (the membership masters): [system-administration.md](system-administration.md).
- **Per-request memoization** -> `requestContextMiddleware` (mounted once in `app.js`) opens an `AsyncLocalStorage` scope; `getCompanyBasics`, `getTenantModuleCatalog` and `getCompanyModuleIds` memoize the Control-Plane facts for the lifetime of ONE request, so every helper that composes them (`getActiveAccountId`, `getCompanyProfile`, `getCompanyCountryCode`, `getCompanyBaseCurrency`, `requireModule`, `companyHasModule`) costs one query per request.
  No TTL, no cross-request staleness; worker jobs run uncached.
- **Reading another service's data** -> call its gateway seam, never `require()` another module's models:
  `platform/membershipGateway.js` (party master reads for AR and Golf), `platform/arGateway.js` (charge posting, credit standing, the Transaction Type catalog, document standing), `platform/taxGateway.js` (scheme listing + `quoteTax`), `platform/dimensionGateway.js` (analysis dimensions), `platform/numberingGateway.js` (document numbers), `platform/identityGateway.js` (portal user provisioning + login token), `platform/notificationGateway.js` (bell + templated email from background jobs), `platform/calendarGateway.js` (weekend/holiday classification, company timezone), `platform/workflowGateway.js` (approval chains).
  Each gateway resolves in-process today and documents the `internalServiceUrl('<service>')` HTTP call it becomes when split (`null` = in-process).
  Control-Plane value reads (`getCompanyLetterhead`, `listSubscriptionCompanies`, `listCallerCompanies`, `listAccountCurrencies`, `getPlatformProfile`, `resolveApprovers`, `listApproverOptions`, the e-Invoice classification list) live on `serviceContext.js` itself.
- **Writes / fan-out across services** -> publish an event to the transactional **outbox** (`platform/outboxMessage.model.js`); the worker reacts.
  Today's event types: `EmailQueued` (every templated email), `DebtorProvisionRequested` and `DebtorCreditLimitSyncRequested` (Membership -> AR through `arGateway`), `UserRegistered` (SSO sign-ups, no email), `TenantProvisioned` (emitted by `provisionTenant`, no consumer yet).
  Keeps writes atomic and services decoupled.
- **Callbacks into a producer** -> composition-time registries, never a reverse `require()`: `src/wiring/workflowHandlers.js` (approval outcomes per purpose) and `src/wiring/dimensionUsage.js` (the Dimension repurpose lock's usage checks).

## Request validation

`platform/validate.js` is the ONE Zod seam: `validate({ params, query, body })` parses each request part, rejects with `400 { message, details }` and REPLACES the part with the parsed, trimmed, unknown-key-stripped result, so controllers and Sequelize only ever see the declared shape.
Zod runs only at the HTTP boundary; internal functions and gateways are never wrapped.
Every route that reads a request part mounts it with a schema from the `*.schemas.js` file beside its controller.
Status: complete since 2026-10-12 across the product modules, the control plane, the shared numbering router and the notification routes; the only bare routes read no request part or take a multipart upload bounded by multer.

## Data ownership & the seam to cut

The only association that crosses a service boundary today is **User <-> Company via CompanyUser** (`wiring/associations.js`).
It is intentionally kept intact in the monolith.
When Identity is extracted, those become **soft UUID references** (no DB FK) and eager-loads become a token claim or a service call.
New product services **must not** add any new cross-boundary FK - store peer ids as plain UUIDs.

### Schema conventions

- **Every product-tier service owns its own Postgres schema** (`membership`, `golf`, `facility`, `ar`, `tax`, `dimension`, `workflow`, `audit`), registered in `platform/schemas.js` and created before sync.
  Platform / control-plane / notification tables stay in `public` for now.
- **Money/amount columns are `numeric(21,2)`** (`DataTypes.DECIMAL(21, 2)` in the model): amounts, fees, charges, credit limits - any value denominated in a currency.
  Percentages and rates are NOT money and keep their own precision (e.g. tax rate `DECIMAL(7,4)`, claim percentage `DECIMAL(5,2)`, exchange rate `DECIMAL(21,10)`).
- **Every new product table carries the ownership stamps** `createdBy` (UUID, nullable), `createdByDepartmentId` (UUID, nullable - the creator's department at creation) and `updatedBy` (UUID, nullable, stamped on every save).
  They power the RBAC data scope (see "How services talk to each other") and the workflow engine's submitter placement.
  Prefer explicit status/state columns over booleans for records an approval flow may govern.
- **Schema sync is fingerprint-gated.**
  Boot computes a sha256 over every registered model (`platform/schemaFingerprint.js`), compares it with the one-row `public."SchemaMeta"` table, and runs `sequelize.sync({ alter: true })` only when a model changed (or `FORCE_SCHEMA_SYNC=1`); every other boot logs "skipping sync" and settles in seconds.
  One-shot data migrations that must run BEFORE the alter-sync (renames, column collapses) sit inside the gated branch in `app.js`; self-healing backfills sit outside it.
  Renames and drops that cannot be expressed as a model change run as scripts BEFORE deploy (`scripts/migrate-*.js`).
- **Every table is audited automatically.**
  `platform/auditHooks.js` attaches global create/update/delete hooks (redaction, after-commit, fail-open) that write `audit.AuditLog`; bulk operations bypass the hooks.

## Auth model

- Only **Identity** mints JWTs (RS256, private key).
  Claims: `id, email, companyId, companyName, isSystemAdmin, rememberMe`; access tokens live 1 hour, kept alive by the rotating httpOnly refresh cookie (24h, or 30 days with "Keep me signed in").
- Every other service **verifies** with the public key (`platform/jwt.keys.js`, `platform/auth.middleware.js`).
  Future: publish a JWKS endpoint instead of sharing the public key by env.

## Frontend strategy

The Angular app stays a **single SPA behind the gateway** - one `environment.apiUrl`.
Its feature areas map to the services (admin/control-plane UI vs. each product), and it can be split into **micro-frontends** later if needed, independently of the backend split.

**Systems = Modules, surfaced by granted Menus.**
Each system (Membership, Golf, Facility, AR, System Setup, SaaS Administration) is a top-level route namespace reached from the **apps switcher** in the top bar (active system lives in the URL).
The shell is **menu-driven by the Control Plane**, so:

- A system appears in the apps switcher **only once the logged-in role has at least one Menu granted in that Module** (the switcher list is built from the user's granted menus).
  So to surface Golf / Membership / Facility: create the Module + a Menu for it (**Modules & Menus** admin screen) and grant that menu to a role (**Role Management**).
  Creating the Module alone is not enough.
- There are **no per-system landing pages** (removed 2026-07-23): switching systems lands on `/home` (My Dashboard), the one home page.
  The `Module.landingRoute` column that once backed them was removed on 2026-09-04.
- Possible follow-up: also list a **subscribed-but-menu-less** system in the switcher (today it requires at least one granted menu).

## Migration plan (strangler-fig)

1. Done - modular monolith (`platform/` + `modules/*` + `wiring/` + `app.js`).
2. Done - reserve product seams: `modules/{membership,golf,facility,ar}` + gateway mounts + `serviceContext.js` and the `*Gateway.js` contracts.
3. Done - build the core systems behind their seams, each in its own Postgres schema (Membership, Golf, AR live; Facility still a stub).
4. Extract **Identity/Auth** first (most self-contained); cut User<->Company FK to soft UUID refs.
5. Extract **System Administration / Control Plane**.
6. Give each product service its own database (the schemas are already separate).
7. Generalize the outbox worker into a **Notification** service (Pub/Sub on Cloud Run).

Cross-cutting changes still to do: per-service migrations (replace the fingerprint-gated alter-sync), JWKS for JWT, a real API gateway.
