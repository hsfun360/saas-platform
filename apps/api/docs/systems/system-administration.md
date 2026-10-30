# System Administration / Control Plane

> Status: LIVE (in monolith as `src/modules/saas`).
> Tier: **Platform**.
> This is the "System Setup / Administration" you see in the UI - and yes, it is a service in its own right, distinct from the core product systems.

## Purpose

The control plane for the whole SaaS: tenancy, RBAC, subscriptions, provisioning, platform reference data.
It answers "*which company, which user, which role, which modules, what permitted*" for every other service.

## Role separation (platform vs tenant) - agreed 2026-07-14

**The platform (System Admin) manages the contract, never tenant data or preferences.**
Account lifecycle, plan, status, module entitlements - yes.
Languages, currencies, reference data, business settings - tenant self-service only, under `/api/auth/account/*` and the System Setup screens.
**The one sanctioned exception is Tenant Admin recovery**: assigning/transferring a company's Tenant Admin when the existing admin left without a backup (Subscribers -> Manage Admin).
Tenant Admin is a PER-COMPANY role (a CompanyUser row's role), so the Manage Admin panel carries a company picker across ALL the subscriber's companies - it must never assume "the first company" (that hid users who belong only to the account's other companies).
It can only promote users who are already members of the chosen company; adding people to a company stays tenant self-service (User Management).
Do not add platform-side editors/endpoints for tenant preference data; the subscription language/currency editors were removed under this rule.

## Owns (data)

All control-plane tables live in `public` (they move to their own schema when the service splits).

**Tenancy and RBAC**

- `Account` (incl. `mfaPolicy` optional|required + `mfaRequiredFrom`, the tenant-level MFA policy edited at `GET/PUT /api/auth/account/security-policy` behind `requireMenuAction('/admin/security-policy')`, 2026-10-30) - the subscriber: `subscriberName`, `ownerUserId`, `subscriptionPlan`, `status`, `defaultLanguageCode`, `defaultCurrencyCode`.
- `Company` - a tenant: `accountId`, `name`, `registrationNumber`, `taxRegistrationNumber`, the LHDN issuer identity (`tin`, `msicCode`, `businessActivityDescription`, `sstRegistrationNumber`, `ttxRegistrationNumber`), contact and address columns, `country` (free text, display only), `countryCode` (canonical alpha-2, lowercase), `logo`, `timezone` (IANA, club-local time for golf windows), `defaultCurrencyCode` (the company's base currency), `isActive`.
- `CompanyUser` - membership + role assignment: `userId`, `companyId` (NULL = the SYSTEM workspace of a platform user), `roleId`, `departmentId`, `positionId`, `isActive`.
- `Module` - the product catalogue: `code` (the frozen UPPER_SNAKE machine identity, globally unique, validated `^[A-Z][A-Z0-9_]*$`, never updated by any API; THE key for `requireModule`, boot seeds and route gating), `name` + `names` (display, localizable, renamable; unique per audience), `icon`, `description`, `isSystem` (platform infrastructure every tenant needs, always entitled, never deletable; `TENANT_ADMIN` today, stamped by `ensureSystemModules()` at boot), `audience` (`tenant` | `platform` - platform modules exist only for platform users and are never entitled by tenants).
  Known codes: `MEMBERSHIP`, `GOLF`, `FACILITY`, `AR`, `POS`, `TENANT_ADMIN` (System Setup), `PLATFORM_ADMIN` (SaaS Administration); legacy rows derived a code from their name once by the 2026-09-04 boot backfill.
- `Menu` - `moduleId`, `name` + `names`, `description` + `descriptions` (localized), `parentId` (adjacency list), `sequence`, `route`, `icon`.
- `CompanyModule` - subscriptions: `companyId`, `moduleId`, `isActive`.
- `Role` - ACCOUNT-level named set of menu permissions: `accountId` (NULL = a PLATFORM role such as System Admin), `name` (unique per account; a partial unique keeps platform names unique too), `description`, `dataScope`.
  Roles are not tied to a company; ASSIGNMENT is per company through `CompanyUser.roleId`.
  The legacy per-company `companyId` column was retired 2026-07-10.
- `RoleMenu` - the grants: `roleId`, `menuId`, `canCreate`, `canEdit`, `canDelete`.
- `Invitation` - the consent-based cross-tenant bridge: `email`, `accountId`, `companyId`, `roleId`, `invitedByUserId`, `token`, `status`, `expiresAt`.
- `RegistrationLead` - the self-subscribe lead: `company`, `name`, `email`, `ipAddress`, `country`, `timezone`, `source`, `occurredOn`, `processedDate`, `status`.
- `UserFavorite` - a user's starred screens for My Dashboard's Quick access (see "User favorites" below).
- `PlatformProfile` - the platform's own "company of record" singleton (`singletonKey = 'platform'`): `legalName`, `tradingName`, `registrationNumber`, `taxRegistrationNumber`, the LHDN issuer identity (`tin`, `msicCode`, `businessActivityDescription`, `sstRegistrationNumber`, `ttxRegistrationNumber`), contact + address columns, `logo`, `countryCode`, `baseCurrencyCode`, `defaultTaxSchemeCode` (anchors the platform's own tax - see tax.md).
  Read by peers through `serviceContext.getPlatformProfile()`.
- `CompanySmtpConfig` - per-company outgoing mail server (`host`, `port`, `secure`, `username`, `passwordEnc` AES-256-GCM under `SMTP_ENCRYPTION_KEY`, `fromEmail`, `fromName`, `isActive`, `lastVerifiedAt`, `lastError`); consumed by the Notification worker (see notification.md).

**Platform reference data** (one global list, maintained under SaaS Administration, consumed read-only):

- `Country` - `alpha2` (PK), `alpha3`, `numericCode`, `name` + `names`, `flagEmoji`, `dialCode`, `isActive`, `syncedAt`; synced from the bundled world-countries list by `POST /api/admin/countries/sync`.
- `Currency` - ISO 4217: `code` (PK), `numericCode`, `name`, `symbol`, `minorUnit`, `isActive`; "Load defaults" seeds the bundled set.
- `Language` - `languageCode` (PK), `name`, `isActive`; "Load defaults" seeds the bundled set.
- `AccountLanguage` / `AccountCurrency` - the subscriber's opted-in subsets (`accountId` + `languageCode` / `currencyCode`), with the defaults on `Account`.
- The seven **e-Invoice (LHDN MyInvois) tables**: `EInvoiceClassificationCode`, `EInvoiceMsicCode` (+ `categoryReference`), `EInvoiceTaxType`, `EInvoiceUnitType`, `EInvoiceStateCode`, `EInvoicePaymentMethod`, `EInvoiceDocumentType` - each `code` (PK), `description`, `isActive`, `syncedAt`, with a "Sync now" from LHDN's published JSON (bundled fallback) under `/api/admin/e-invoice-*`.
  Peers read them through `serviceContext.eInvoiceClassificationCodeExists` / `listEInvoiceClassificationCodes` (the AR Transaction Type catalog validates its `eInvoiceClassificationCode` this way).

**Subscriber-owned shared reference data** (one list per Account, maintained by the Tenant Admin, consumed by the product systems by value reference - never a cross-service FK): `IndustryType` (`industryTypeCode`), `Salutation`, `Nationality`, `Race`, `Title` (`titleCode`), `PublicHoliday`, `Department` (`departmentCode`), `Position` (`positionCode`, `rank`).
`Title` (honorific: Datuk/Tan Sri/Sir/...) additionally carries an OPTIONAL `countryCode` (`Country.alpha2`; NULL = universal) because some honours are country-specific; validated against the full Country table (not just operating countries).
Consumer `GET /api/titles?countryCode=xx` returns universal + that country's titles.
(Nationality, by contrast, is deliberately NOT country-linked - residence is not nationality.)
Each follows the same shape: unique `(accountId, code)`, enable/disable via `isActive` (no hard delete), maintenance under `/api/auth/account/<name>` + a System Setup screen (`/admin/<name>`), and an active-only consumer list at `GET /api/<name>` for any workspace user's pickers.
(Promoted out of the Membership master files - see [membership-management.md](membership-management.md) #4-#7.)

`PublicHoliday` extends the shape with a country dimension: rows are unique per `(accountId, countryCode, holidayDate, description)`, where `countryCode` is a value reference to `Country.alpha2` and must be one of the account's active companies' `Company.countryCode` values (the countries the subscriber operates in, served by `GET /api/auth/account/public-holidays/countries`).
The System Setup screen (`/admin/public-holidays`) hides the country picker and defaults it silently when the subscriber's companies are all in one country.
The consumer list `GET /api/public-holidays?year=` resolves the caller's company country automatically and returns only that country's active holidays.

**Company-level setup**: `CompanyWeekendDay` - which weekday(s) are one company's weekend / rest days (ISO 1-7; varies by state even within a country, e.g. Fri+Sat vs Sat+Sun in Malaysia).
A selection set, not a lifecycle master: one row per `(companyId, dayOfWeek)` (unique together), saved whole via `GET/PUT /api/auth/companies/:companyId/weekend-days` (Tenant Admin, a dialog on the Companies screen like the SMTP config); no `isActive`.
A company with no rows is "not configured": the consumer list `GET /api/weekend-days` (the caller's own company) returns `[]` and weekday/weekend pricing (e.g. golf green fees) never applies a weekend rate.
Weekend days + public holidays are read by the products through `platform/calendarGateway.js` (`classifyDateRange`, `companyDayContext`, `companyTimezone`); the platform rule is that PUBLIC HOLIDAYS COUNT AS WEEKEND.

**Numbering Control** (SRS 2.1.13) - SPLIT PER MODULE since 2026-08-05.
The Control Plane owns the CODE (the shared column definition `platform/numberingSchemeDef.js`, the generator `saas/numberingGenerator.js`, the config service `saas/numberingScheme.service.js`, the vocabularies `saas/numberingScheme.constants.js`, and the endpoint factory `platform/numberingController.js`), but the DATA lives in the owning module's schema so the gapless counter is locked inside the same transaction as the documents it numbers: `membership.NumberingScheme`, `ar.NumberingScheme` and `golf.NumberingScheme` (identical shape: `companyId`, `purpose`, `mode`, `prefix`, `format`, `seqPadLength`, `startingNumber`, `currentNumber`, `resetRule`, `currentPeriod`, `isActive`; unique `(companyId, purpose)`).
The 16 purposes: `membership` (Membership No.); `golf-booking`, `golf-registration`, `golf-bill`, `golf-raincheck`, `golf-proforma`, `golf-refund`; `ar-invoice`, `ar-debit-note`, `ar-credit-note`, `ar-interest`, `ar-deposit`, `ar-receipt`, `ar-refund`, `ar-statement`, `ar-other-debtor`.
`mode` = `auto` (system generates on save) or `manual` (staff key it in, e.g. pre-printed cards).
For `auto`, a token `format` (`{PREFIX}{SEQ}{YYYY}{YY}{MM}{TYPE}` - `{TYPE}` is the membership type's category code, filled at creation) plus a running counter (`currentNumber` + `currentPeriod`, reset `never`/`annually`/`monthly`) produce the next value, issued **atomically** under a `SELECT ... FOR UPDATE` row lock inside the caller's business transaction (a rolled-back create rewinds the counter).
The seam is [`platform/numberingGateway.js`](../src/platform/numberingGateway.js): `getMode`, `issueNumber` (request-scoped), `issueNumberForCompany` (background jobs and workflow handlers), `numberingMeta`, `getScheme`, `saveScheme`, `previewScheme`, and `modelForPurpose` (routes `ar-*` to AR's table, `golf-*` to Golf's, everything else to Membership's); products never touch the models.
Maintenance screens are per module (`/membership/numbering`, `/ar/numbering`, `/golf/numbering`) over `/api/<module>/numbering-schemes` (GET /meta, GET /, POST /, PATCH /:id, POST /preview, plus the copy-from-company trio) behind that module's menu grant; the old Control-Plane `/api/auth/company/numbering-schemes` routes and `/admin/numbering` screen are gone, and a boot migration copied the retired `public."NumberingScheme"` rows into the per-module tables.
Note: the counter is one series per company+purpose; per-membership-type independent series would be a follow-up (segment the counter) if a club needs it.

**Menus & the role permission picker**: `Menu` nests via `parentId` (adjacency list; a menu with children is a pure grouping section in the sidebar, not a navigable screen).
Each menu also carries a `description` (STRING 255, nullable) + localized `descriptions` (JSONB keyed by language code, same fallback pattern as `name`/`names`), maintained in Modules & Menus and shown under the menu name in the Role Management permission picker so a role builder understands each option.
RBAC grants (`RoleMenu`) store **leaf menus only**: grouping menus are never granted - login re-adds the ancestor sections of any granted menu (`withAncestors` in `identity/auth.controller.js`), and the role screen strips legacy parent grants on load/save.
The picker itself renders one collapsible card per module (tri-state select-all + "x of y selected" in the header), the real menu tree with group sub-headings, a live search over name/description, and a selection summary before Save.
The Tenant-Admin navigation (System Setup) and the platform navigation (SaaS Administration) are both DB Module + Menu trees, not frontend hardcodes; `platformNav.seed.js` ensures the platform tree at boot.

**Action-level RBAC (Phase 1 of the CRUD/permission roadmap)**: each `RoleMenu` grant carries `canCreate` / `canEdit` / `canDelete` (BOOLEAN NOT NULL DEFAULT true - the row existing means View, so pre-flag grants stay full access).
The role endpoints accept `permissions: [{ menuId, canCreate?, canEdit?, canDelete? }]` (legacy `menuIds` still accepted = full access), and the login menus payload carries `actions: { create, edit, delete }` per menu.
Enforcement: `requireMenuAction(menuRoute)` in `platform/serviceContext.js` - the product-side middleware that maps the HTTP method (GET view / POST create / PUT+PATCH edit / DELETE delete) to the caller's grant on the screen's `Menu.route`; Tenant Admin and platform admins bypass; an unregistered route enforces nothing.
Reference wiring: `modules/membership/membership.routes.js` (statuses/fees/types).
Frontend gating (UX only, backend stays authoritative): `PermissionsService.can()` + the structural `*appCan="'create'|'edit'|'delete'"` directive hide the New/Edit/Delete/Enable/Disable controls a role doesn't have; reference screens: the three membership master files.

**Org placement (Phase 2 of the CRUD/permission roadmap)**: `Department` and `Position` are subscriber masters (IndustryType shape; screens at `/admin/departments` and `/admin/positions`, consumer lists at `GET /api/departments` / `/api/positions`).
`Position.rank` INTEGER = seniority (HIGHER = more senior; equal ranks are peers; defaults seed Staff 10 / Supervisor 20 / Manager 30 via a preview-and-select "Load defaults").
Both are assigned per company membership - `CompanyUser.departmentId` / `positionId` (nullable plain UUIDs like `roleId`, set through `POST /auth/company/users/assign-role` and the User Management screen).
Unassigned = no placement; Phase 3 treats that as "own records only".

**Data scope (Phase 3 of the CRUD/permission roadmap)**: `Role.dataScope` (STRING(20) NOT NULL DEFAULT 'all'; own / department / all) bounds whose records the role may Edit/Delete (viewing untouched); a radio in the role dialog sets it.
The rule: `own` = records the caller created; `department` = own, plus records stamped with the caller's CURRENT department whose owner's current rank is STRICTLY lower (senior over junior; peers cannot; an owner without a position counts as most junior; a caller without placement falls back to own-only); `all` = everything including legacy unowned rows (which own/department can NEVER touch).
Records carry `createdBy` + `createdByDepartmentId` (stamped at creation) + `updatedBy` (every save; workflow groundwork) - reference implementation: the three membership masters, which enforce via `canModifyRecord()` on update paths and return a per-row `canModify` flag (from `annotateCanModify()`) so the UI hides Edit/Enable/Disable on untouchable rows.
Seam: `getAccessContext` / `getCallerPlacement` / `canModifyRecord` / `annotateCanModify` in `platform/serviceContext.js`.
Every new product table MUST include the three stamp columns and wire the same enforcement.

## Public API

### Platform side - `/api/admin` (`admin.routes.js`)

Authorization is two layers, mirroring the tenant side: `verifyToken` + `isPlatformUser` (`rbac.middleware.js` - the caller holds an ACTIVE system-level membership, a `CompanyUser` with `companyId NULL`, whatever platform role; the `ADMIN_EMAILS` env list is kept ONLY as a logged break-glass fallback), then `requireMenuAction('<SaaS Administration screen>')` per route; the master "System Admin" role bypasses layer 2 through the JWT `isSystemAdmin` claim.

- Roles: `POST|GET /roles`, `GET|PUT|DELETE /roles/:id` (`/admin/system-roles`), `GET /menus` (the platform-audience permission catalogue).
- Modules & Menus: `GET /modules`, `POST /modules`, `PUT|DELETE /modules/:moduleId`, `GET /modules/:moduleId/menus`, `PUT /modules/:moduleId/menus/order`, `POST /menus`, `PUT|DELETE /menus/:menuId` - gated by the screen matching the TARGET's audience (`/admin/modules-menus` for tenant modules, `/admin/platform-menus` for platform ones), so a role granted one side can never reach the other.
- Users: `GET|POST /users`, `PATCH /users/:id`, `PATCH /users/:id/status`, `POST /users/assign-role`, `POST /users/:userId/mfa/reset` (the platform arm of the MFA recovery exception), `GET /unverified-users` + `POST /unverified-users/delete`.
- Subscribers: `POST|GET /subscriptions`, `PATCH /subscriptions/:id`, `GET /companies/:companyId/users`, `POST /companies/:companyId/tenant-admin` (the Tenant Admin recovery exception).
- `GET /audit-log` - the read-only viewer over `audit.AuditLog`.
- Email templates: `GET /email-templates`, `GET|PUT /email-templates/:key`, `POST /email-templates/:key/reset|preview|test`.
- Platform tax: `/tax/*` (see tax.md) and `GET|PUT /platform-profile`, `POST /platform-profile/logo`, `POST /platform-profile/quote`.
- Reference data: `/countries` (`POST /sync`, list, `PATCH /:alpha2`), `/languages` and `/currencies` (`POST /seed`, list, create, patch, delete), and the seven `/e-invoice-*` families (`POST /sync`, list, create, patch, delete - the only admin routes with `validate()` mounted so far).

### Tenant side - hosted on `/api/auth` (`identity/auth.routes.js`, delegating into `saas/*.controller.js`)

Gated by `authenticateToken` + `requireTenant` + `requireTenantAdmin` (`hasTenantAdminRole`), except where noted.

- Roles and menus: `GET /company/menus`, `POST /company/roles` (legacy), `GET|PUT|DELETE /company/roles/:roleId`, `GET /account/menus`, `GET|POST /account/roles`, `GET|PUT|DELETE /account/roles/:roleId`.
- Users: `GET|POST /company/users`, `PATCH /company/users/:userId`, `POST /company/users/:userId/mfa/reset`, `POST /company/users/assign-role` (role + department + position), `POST /company/users/revoke`, `GET /account/users` (account-wide person-centric view), `POST /company/collaborators`.
- Invitations: `POST|GET /company/invitations`, `POST /company/invitations/:id/revoke` (admin side); `GET /invitations`, `POST /invitations/:id/accept|decline` (invitee side, any logged-in user matched by email).
- Companies: `GET /company/available-modules`, `GET|POST /companies`, `PUT /companies/:companyId`, `PUT /companies/:companyId/modules`, `POST /company/logo`, `GET|PUT|DELETE /companies/:companyId/smtp` + `POST /companies/:companyId/smtp/test`, `GET|PUT /companies/:companyId/weekend-days`.
- Subscriber preferences: `GET|PUT /account/languages`, `GET|PUT /account/currencies`, `GET|PATCH /me/language` (any user).
- Subscriber reference data: `GET|POST /account/<industry-types|salutations|nationalities|races|titles|departments|positions|public-holidays>` + `PATCH .../:id`, `GET /account/positions/defaults` + `POST /account/positions/seed`, `GET /account/public-holidays/countries`.
- Subscriber email-template overrides: `GET /account/email-templates`, `GET|PUT|DELETE /account/email-templates/:key`, `POST /account/email-templates/:key/preview|test`.
- `GET /account/audit-log` - the tenant-scoped audit view (entries made by the account's staff in the account's workspaces; platform entries and the `User` table excluded).
- Self-service: `GET|PUT /my/favorites` (any authenticated workspace user).

### Consumer lists (any workspace user, `verifyToken` only)

`GET /api/countries`, `/api/currencies`, `/api/languages` (+ the unauthenticated `GET /api/public/languages` for the login screen), `/api/industry-types`, `/api/salutations`, `/api/nationalities`, `/api/races`, `/api/titles[?countryCode=]`, `/api/departments`, `/api/positions`, `/api/public-holidays?year=`, `/api/weekend-days`, and the seven `/api/e-invoice-*` lists - active rows only, for product pickers.

### Request validation status

Every control-plane route that reads a request part mounts `validate()` (completed 2026-10-12): the `/api/admin` routes through `admin.schemas.js`, `emailTemplate.schemas.js`, `platformProfile.schemas.js`, `country.schemas.js`, `language.schemas.js`, `currency.schemas.js` and the e-Invoice inline schemas; the identity-hosted tenant-admin routes through `tenant.schemas.js`, `invitation.schemas.js`, `referenceData.schemas.js`, `accountLanguage.schemas.js`, `accountCurrency.schemas.js`, `accountEmailTemplate.schemas.js`, `companyWeekendDay.schemas.js`, `userFavorite.schemas.js` and the identity `profile.schemas.js` / `workspace.schemas.js`; the shared numbering router through `platform/numbering.schemas.js`.
Multipart uploads stay bare behind multer's own limits, as do routes that read no request part.

## User favorites (My Dashboard Quick access, 2026-07-22)

`UserFavorite` stores the screens a user pinned via the bookmark star beside every screen title, so Quick access follows the user across devices (same reasoning as `User.lastWorkspaceId` - never localStorage for durable personal state).
- One row per starred screen: `userId` + `companyId` + `menuId` (unique) + `sequence` (the user's own sort order).
  Favorites are per WORKSPACE - the same person's list differs per company.
  All references are plain UUIDs, no DB FKs, per the golden rules.
  Menu IDS are stored (not routes) so a route or label rename in Modules & Menus cannot break a favorite.
- `GET /api/auth/my/favorites` returns the ordered `menuIds`; `PUT` replaces the WHOLE ordered list (star toggle and reorder both go through it - same PUT-replace pattern as `CompanyWeekendDay`).
  Unknown menu ids are dropped server-side; the client additionally renders only ids present in the login's granted-menu cache, so a revoked screen vanishes silently.
- The web side (`FavoritesService`) toggles optimistically with rollback and performed a one-time migration from the earlier localStorage list.

## Provisioning

`provisioning.service.provisionTenant()` is the ONE path that creates a subscriber: Account + Company + the Tenant Admin role + the owner's `CompanyUser`, used by both the platform's `POST /api/admin/subscriptions` and the self-service onboarding wizard (`POST /api/auth/onboarding/provision`).
It emits a `TenantProvisioned` outbox event (no consumer yet) and `ensureSystemModules()` guarantees every tenant is entitled to the `isSystem` modules.
Collaborator invitations enqueue a templated `collaborator.invite` email (`EmailQueued`); the old `CollaboratorInvited` event type has no producer any more.

## Provides to other services (the authorization contract, `platform/serviceContext.js`)

- **Module subscription check** - "is company X subscribed to the module with code Y?" Backs `requireModule()` and `companyHasModule()`, both keyed by the frozen `Module.code`; the raw facts (`getTenantModuleCatalog`, `getCompanyModuleIds`) are exposed for seams that must map codes to ids (Dimension's per-module applicability).
  When split, expose this as e.g. `GET /api/admin/entitlements?companyId=&module=` (or a signed claim).
- **Menu-action check** - "may user X's role create/edit/delete on screen Y?" Backs `requireMenuAction()` (role -> `RoleMenu` grant flags by `Menu.route`), `requireAnyMenuAction(routes[])` (the variant for endpoints SHARED by several screens - the caller passes if ANY of the given menu routes grants the action, with the same permissive defaults) and `holdsMenu(req, route)` (an in-handler check for one field gated on another screen's grant).
- **Data-scope context** - a user's role `dataScope` + department + position rank in the active company.
  Backs `getAccessContext()` / `getCallerPlacement()` / `canModifyRecord()` / `annotateCanModify()` for row-level authorization.
- **Context** - `getCompanyBasics` (per-request memoized), `getActiveAccountId`, `getActiveCompany`, `getCompanyProfile`, `getCompanyLetterhead`, `getCompanyCountryCode`, `getCompanyBaseCurrency`, `getPlatformProfile`, `listSubscriptionCompanies` (every sibling under the account), `listCallerCompanies` (only the workspaces the caller may enter - the copy-from-company features use this), `listAccountCurrencies`.
- **Workflow approver resolution** - `resolveApprovers(companyId, rule)` and `listApproverOptions(req)`, so the Workflow service never requires the org models.
- **Calendar** - `platform/calendarGateway.js` reads weekend days, public holidays and the company timezone.

## Depends on

- Identity: `userId` references (soft UUID once split); verifies its JWT.
- Notification (outbox): `collaborator.invite` and `account.activation` emails as `EmailQueued`; `TenantProvisioned` event.

## Consumed by

- Every product service (entitlement + role/permission checks).
- The Angular admin UI (SaaS Administration, System Setup, Companies, Role/User Management).

## Migration status

- [x] Module folder · [x] Numbering data split out to the product schemas · [x] validate() on the control-plane routes (2026-10-12) · [ ] Entitlements HTTP API · [ ] Own DB · [ ] Own deploy
