# System Administration / Control Plane

> Status: LIVE (in monolith as `src/modules/saas`). Tier: **Platform**.
> This is the "System Setup / Administration" you see in the UI - and yes, it is a
> service in its own right, distinct from the core product systems.

## Purpose
The control plane for the whole SaaS: tenancy, RBAC, subscriptions, provisioning.
It answers "*which company, which user, which role, which modules, what permitted*"
for every other service.

## Role separation (platform vs tenant) - agreed 2026-07-14

**The platform (System Admin) manages the contract, never tenant data or
preferences.** Account lifecycle, plan, status, module entitlements - yes.
Languages, currencies, reference data, business settings - tenant self-service
only, under `/api/auth/account/*` and the System Setup screens.
**The one sanctioned exception is Tenant Admin recovery**: assigning/transferring
a company's Tenant Admin when the existing admin left without a backup
(Subscribers -> Manage Admin).
Tenant Admin is a PER-COMPANY role (a CompanyUser row's role), so the Manage
Admin panel carries a company picker across ALL the subscriber's companies -
it must never assume "the first company" (that hid users who belong only to
the account's other companies).
It can only promote users who are already members of the chosen company;
adding people to a company stays tenant self-service (User Management).
Do not add platform-side editors/endpoints for tenant preference data; the
subscription language/currency editors were removed under this rule.

## Owns (data)
`Account`, `Company`, `CompanyUser` (membership + role assignment), `Module`,
`Menu`, `CompanyModule` (subscriptions), `Role`, `RoleMenu` (permissions),
`Invitation`, `RegistrationLead`, `UserFavorite` (a user's starred screens for
My Dashboard's Quick access - see "User favorites" below).

**Subscriber-owned shared reference data** (one list per Account, maintained by the
Tenant Admin, consumed by the product systems by value reference - never a
cross-service FK): `IndustryType`, `Salutation`, `Nationality`, `Race`, `Title`, `PublicHoliday`,
`Department`, `Position`.
`Title` (honorific: Datuk/Tan Sri/Sir/...) additionally carries an OPTIONAL
`countryCode` (`Country.alpha2`; NULL = universal) because some honours are
country-specific; validated against the full Country table (not just operating
countries). Consumer `GET /api/titles?countryCode=xx` returns universal + that
country's titles. (Nationality, by contrast, is deliberately NOT country-linked -
residence is not nationality.)
Each follows the same shape: unique `(accountId, code)`, enable/disable via
`isActive` (no hard delete), maintenance under `/api/auth/account/<name>` +
a System Setup screen (`/admin/<name>`), and an active-only consumer list at
`GET /api/<name>` for any workspace user's pickers.
(Promoted out of the Membership master files - see
[membership-management.md](membership-management.md) #4-#6. Note: `Nationality`
is deliberately NOT linked to `Country` - residence is not nationality.)

`PublicHoliday` extends the shape with a country dimension: rows are unique per
`(accountId, countryCode, holidayDate, description)`, where `countryCode` is a
value reference to `Country.alpha2` and must be one of the account's active
companies' `Company.countryCode` values (the countries the subscriber operates
in, served by `GET /api/auth/account/public-holidays/countries`).
The System Setup screen (`/admin/public-holidays`) hides the country picker and
defaults it silently when the subscriber's companies are all in one country.
The consumer list `GET /api/public-holidays?year=` resolves the caller's
company country automatically and returns only that country's active holidays.

**Company-level setup**: `CompanyWeekendDay` - which weekday(s) are one
company's weekend / rest days (ISO 1-7; varies by state even within a country,
e.g. Fri+Sat vs Sat+Sun in Malaysia).
A selection set, not a lifecycle master: one row per `(companyId, dayOfWeek)`
(unique together), saved whole via
`GET/PUT /api/auth/companies/:companyId/weekend-days` (Tenant Admin, a dialog
on the Companies screen like the SMTP config); no `isActive`.
A company with no rows is "not configured": the consumer list
`GET /api/weekend-days` (the caller's own company) returns `[]` and
weekday/weekend pricing (e.g. golf green fees) never applies a weekend rate.

**Numbering Control** (SRS 2.1.13): `NumberingScheme` - per-company document
numbering, one row per `(companyId, purpose)` (only `membership` today; the
table is general for prospect/application/etc. later).
`mode` = `auto` (system generates on save) or `manual` (staff key it in, e.g.
pre-printed cards).
For `auto`, a token `format` (`{PREFIX}{SEQ}{YYYY}{YY}{MM}{TYPE}` - `{TYPE}` is
the membership type's category code, filled at creation) plus a running counter
(`currentNumber` + `currentPeriod`, reset `never`/`annually`/`monthly`) produce
the next value, issued **atomically** (row lock) by
[`platform/numberingGateway.js`](../src/platform/numberingGateway.js) - the seam
the future member screen calls (`getMode` / `issueNumber`); products never touch
the model.
Maintenance: Tenant-Admin routes under `/api/auth/company/numbering-schemes`
(active company) + a System Setup screen (`/admin/numbering`) with a live
next-number preview.
Note: the counter is one series per company+purpose; per-membership-type
independent series would be a follow-up (segment the counter) if a club needs it.

**Menus & the role permission picker**: `Menu` nests via `parentId` (adjacency
list; a menu with children is a pure grouping section in the sidebar, not a
navigable screen).
Each menu also carries a `description` (STRING 255, nullable) + localized
`descriptions` (JSONB keyed by language code, same fallback pattern as
`name`/`names`), maintained in Modules & Menus and shown under the menu name in
the Role Management permission picker so a role builder understands each option.
RBAC grants (`RoleMenu`) store **leaf menus only**: grouping menus are never
granted - login re-adds the ancestor sections of any granted menu
(`withAncestors` in `identity/auth.controller.js`), and the role screen strips
legacy parent grants on load/save.
The picker itself renders one collapsible card per module (tri-state select-all
+ "x of y selected" in the header), the real menu tree with group sub-headings,
a live search over name/description, and a selection summary before Save.

**Action-level RBAC (Phase 1 of the CRUD/permission roadmap)**: each `RoleMenu`
grant carries `canCreate` / `canEdit` / `canDelete` (BOOLEAN NOT NULL DEFAULT
true - the row existing means View, so pre-flag grants stay full access).
The role endpoints accept `permissions: [{ menuId, canCreate?, canEdit?, canDelete? }]`
(legacy `menuIds` still accepted = full access), and the login menus payload
carries `actions: { create, edit, delete }` per menu.
Enforcement: `requireMenuAction(menuRoute)` in `platform/serviceContext.js` -
the product-side middleware that maps the HTTP method (GET view / POST create /
PUT+PATCH edit / DELETE delete) to the caller's grant on the screen's `Menu.route`;
Tenant Admin and platform admins bypass; an unregistered route enforces nothing.
Reference wiring: `modules/membership/membership.routes.js` (statuses/fees/types).
Frontend gating (UX only, backend stays authoritative): `PermissionsService.can()`
+ the structural `*appCan="'create'|'edit'|'delete'"` directive hide the
New/Edit/Delete/Enable/Disable controls a role doesn't have; reference screens:
the three membership master files.

**Org placement (Phase 2 of the CRUD/permission roadmap)**: `Department` and
`Position` are subscriber masters (IndustryType shape; screens at
`/admin/departments` and `/admin/positions`, consumer lists at
`GET /api/departments` / `/api/positions`).
`Position.rank` INTEGER = seniority (HIGHER = more senior; equal ranks are
peers; defaults seed Staff 10 / Supervisor 20 / Manager 30 via a
preview-and-select "Load defaults").
Both are assigned per company membership - `CompanyUser.departmentId` /
`positionId` (nullable plain UUIDs like `roleId`, set through
`POST /auth/company/users/assign-role` and the User Management screen).
Unassigned = no placement; Phase 3 treats that as "own records only".

**Data scope (Phase 3 of the CRUD/permission roadmap)**: `Role.dataScope`
(STRING(20) NOT NULL DEFAULT 'all'; own / department / all) bounds whose
records the role may Edit/Delete (viewing untouched); a radio in the role
dialog sets it.
The rule: `own` = records the caller created; `department` = own, plus records
stamped with the caller's CURRENT department whose owner's current rank is
STRICTLY lower (senior over junior; peers cannot; an owner without a position
counts as most junior; a caller without placement falls back to own-only);
`all` = everything including legacy unowned rows (which own/department can
NEVER touch).
Records carry `createdBy` + `createdByDepartmentId` (stamped at creation) +
`updatedBy` (every save; workflow groundwork) - reference implementation: the
three membership masters, which enforce via `canModifyRecord()` on update paths
and return a per-row `canModify` flag (from `annotateCanModify()`) so the UI
hides Edit/Enable/Disable on untouchable rows.
Seam: `getAccessContext` / `getCallerPlacement` / `canModifyRecord` /
`annotateCanModify` in `platform/serviceContext.js`.
Every new product table MUST include the three stamp columns and wire the same
enforcement.

## Public API (gateway seam: `/api/admin` + tenant routes under `/api/auth/company/*`)
- Provision subscribers (Account + Company + owner User), list subscribers.
- Modules & Menus maintenance (the product catalog every core system registers in).
- Roles + role↔menu permissions; tenant user management; collaborator invitations;
  company profile + module subscriptions.
- User favorites (self-service): `GET`/`PUT /api/auth/my/favorites` (see below).

## User favorites (My Dashboard Quick access, 2026-07-22)
`UserFavorite` stores the screens a user pinned via the bookmark star beside
every screen title, so Quick access follows the user across devices (same
reasoning as `User.lastWorkspaceId` - never localStorage for durable personal
state).
- One row per starred screen: `userId` + `companyId` + `menuId` (unique) +
  `sequence` (the user's own sort order). Favorites are per WORKSPACE - the
  same person's list differs per company. All references are plain UUIDs, no
  DB FKs, per the golden rules. Menu IDS are stored (not routes) so a route or
  label rename in Modules & Menus cannot break a favorite.
- `GET /api/auth/my/favorites` returns the ordered `menuIds`;
  `PUT` replaces the WHOLE ordered list (star toggle and reorder both go
  through it - same PUT-replace pattern as `CompanyWeekendDay`). Unknown menu
  ids are dropped server-side; the client additionally renders only ids present
  in the login's granted-menu cache, so a revoked screen vanishes silently.
- The web side (`FavoritesService`) toggles optimistically with rollback and
  performed a one-time migration from the earlier localStorage list.

## Provides to other services (the authorization contract)
- **Module subscription check** - "is company X subscribed to module Y?" Backs
  `requireModule()` in `platform/serviceContext.js`. When split, expose this as e.g.
  `GET /api/admin/entitlements?companyId=&module=` (or a signed claim).
- **Menu-action check** - "may user X's role create/edit/delete on screen Y?"
  Backs `requireMenuAction()` (role -> `RoleMenu` grant flags by `Menu.route`).
  `requireAnyMenuAction(routes[])` is the variant for endpoints SHARED by
  several screens (e.g. the Business Insights meta/drill endpoints, reachable
  from both analysis pages): the caller passes if ANY of the given menu routes
  grants the action, with the same permissive defaults (admin bypass; menus not
  in the catalogue enforce nothing).
- **Data-scope context** - a user's role `dataScope` + department + position
  rank in the active company. Backs `getAccessContext()` /
  `canModifyRecord()` / `annotateCanModify()` for row-level authorization.
- **Context** - a company's roles, a user's permitted menus, account ownership.

## Depends on
- Identity: `userId` references (soft UUID once split); verifies its JWT.
- Notification (outbox): CollaboratorInvited, etc.

## Consumed by
- Every product service (entitlement + role/permission checks).
- The Angular admin UI (SaaS Administration, Companies, Role/User Management).

## Migration status
- [x] Module folder · [ ] Entitlements HTTP API · [ ] Own DB · [ ] Own deploy
