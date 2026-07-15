# System Administration / Control Plane

> Status: LIVE (in monolith as `src/modules/saas`). Tier: **Platform**.
> This is the "System Setup / Administration" you see in the UI - and yes, it is a
> service in its own right, distinct from the core product systems.

## Purpose
The control plane for the whole SaaS: tenancy, RBAC, subscriptions, provisioning.
It answers "*which company, which user, which role, which modules, what permitted*"
for every other service.

## Owns (data)
`Account`, `Company`, `CompanyUser` (membership + role assignment), `Module`,
`Menu`, `CompanyModule` (subscriptions), `Role`, `RoleMenu` (permissions),
`Invitation`, `RegistrationLead`.

**Subscriber-owned shared reference data** (one list per Account, maintained by the
Tenant Admin, consumed by the product systems by value reference - never a
cross-service FK): `IndustryType`, `Salutation`, `Nationality`, `Race`, `Title`, `PublicHoliday`.
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

## Public API (gateway seam: `/api/admin` + tenant routes under `/api/auth/company/*`)
- Provision subscribers (Account + Company + owner User), list subscribers.
- Modules & Menus maintenance (the product catalog every core system registers in).
- Roles + role↔menu permissions; tenant user management; collaborator invitations;
  company profile + module subscriptions.

## Provides to other services (the entitlement contract)
- **Module subscription check** - "is company X subscribed to module Y?" Backs
  `requireModule()` in `platform/serviceContext.js`. When split, expose this as e.g.
  `GET /api/admin/entitlements?companyId=&module=` (or a signed claim).
- **Context** - a company's roles, a user's permitted menus, account ownership.

## Depends on
- Identity: `userId` references (soft UUID once split); verifies its JWT.
- Notification (outbox): CollaboratorInvited, etc.

## Consumed by
- Every product service (entitlement + role/permission checks).
- The Angular admin UI (SaaS Administration, Companies, Role/User Management).

## Migration status
- [x] Module folder · [ ] Entitlements HTTP API · [ ] Own DB · [ ] Own deploy
