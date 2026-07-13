# Membership Management

> Status: PLANNED (stub at `src/modules/membership`, gateway seam `/api/membership`
> reserved). Tier: **Product (core system)**. Fill in as it is built.

## Purpose
Manage club members: member records, categories/tiers, dues/billing, status
(active/suspended/expired), dependents, cards. Likely the **identity anchor for the
other product systems** - Golf and Facility reference a member.

## Owns (data) - fill in
- e.g. `Member`, `MembershipTier`, `MemberDependent`, `MembershipBilling`…
- References `userId` and `companyId` by **UUID only** (no FK into Identity/Control
  Plane). A member may or may not map to a login `User`.

## Public API (gateway seam: `/api/membership`) - fill in
- e.g. `GET/POST /members`, `/members/:id`, `/tiers`, `/members/:id/billing`…

## Depends on
- Identity (JWT verify) · Control Plane (`requireModule('Membership Management')`,
  roles/permissions).
- Notification (outbox): `MemberCreated`, `MembershipRenewed`, `MembershipExpired`.

## Consumed by
- **Golf** and **Facility** (resolve/validate a member, check standing) - via this
  service's HTTP API (`internalServiceUrl('membership')`), not shared tables.

## Auth & entitlements
- Valid JWT + active company subscribed to the **Membership Management** module.

## Migration status
- [ ] Models · [ ] Routes/controllers · [ ] Events · [ ] Own DB · [ ] Own deploy

## Master File Setup (planned)

> Status: PLANNED - list captured, per-file requirements to be provided one at a time.
> These are the configurable lookup/master tables a club sets up before day-to-day membership operations.

### Shared conventions (follow the reference-table pattern)
- Same shape as the platform reference tables (Country / Currency / Language): a stable `code`, a display `name`, an `isActive` flag, and a sort/order field.
- **Enable / disable only, never hard delete** (a record may already be referenced by a member), matching the Currency and Language screens.
- Tenant-scoped master data: each subscriber configures its own set (references `companyId` by UUID), unlike the platform-wide Country/Currency/Language tables.
- Each gets an admin maintenance screen under the Membership module and a "Load defaults" seed where a sensible default set exists.
- Where a master file overlaps an existing platform reference table, reference it rather than duplicating it (see notes below).

### The files (develop one by one)
| # | Master file | Intended purpose (to confirm) | Notes |
| --- | --- | --- | --- |
| 1 | Membership Status | Lifecycle state of a member (e.g. Active, Suspended, Expired, Resigned). | **BUILT** - see below. Drives entitlement/standing checks used by Golf and Facility. |
| 2 | Membership Fee | Fee/dues definitions applied to membership (amount, cycle, currency). | **BUILT** - see below. Header + installment schedule; references a Tax Scheme via the tax seam. |
| 3 | Membership Type | Category/tier of membership (e.g. Ordinary, Corporate, Life, Term). | **BUILDING (phased)** - Phase 1 (main table) done; Phase 2 Additional Fees + Phase 3 Standing Charges pending. |
| 4 | Industry Type | Member's industry/business sector, for corporate members and reporting. | |
| 5 | Salutation | Title prefix for a person (e.g. Mr, Mrs, Ms, Dr, Datuk). | Small curated list; culture/locale aware. |
| 6 | Nationality | Member's nationality. | Should reference the existing platform **Country** reference table (alpha-2) rather than a free-text list. |
| 7 | Race | Member's race/ethnicity, for demographic reporting. | Locale-specific; keep the default set editable per subscriber. |

### DB isolation - own Postgres schema

Every Membership Management table lives in the dedicated **`membership`** Postgres schema (e.g. `membership."MembershipStatus"`), not `public`.
This is the physical half of the microservice seam: the service extracts later with a clean `pg_dump --schema=membership` into its own database, with no table renames and no app changes.
Implemented via `schema: MEMBERSHIP_SCHEMA` on each model (see `src/platform/schemas.js`); the schema is created before `sequelize.sync()` in `app.js`.
Golf and Facility follow the same pattern (`golf`, `facility`) as they are built; platform / control-plane tables stay in `public` for now.

### Built: Membership Status (#1)

Per-company master file. Owner table `membership."MembershipStatus"` (references `companyId` by UUID, no FK).

Fields: `membershipStatus` (the status value, unique per company - the legacy code-base "status code", renamed since the PK is the UUID `id`), `statusClass` (fixed vocabulary), `description`, `systemControl` (fixed vocabulary), `statusColor` (hex, new-record default black), `isActive` (enable/disable, no hard delete).

Fixed vocabularies (stored as the `key`, served to the UI via `/meta` so dropdowns never drift from server validation) - defined in `membershipStatus.constants.js`:
- **Status class:** active, provisional, resigned, decease, terminate, absent, suspend, defaulter, expired, active-absent.
- **System control:** barred, allow, warning, warning-no-charge.

API (all behind `verifyToken` + `requireModule('Membership Management')`):
- `GET /api/membership/statuses/meta` - the two option lists for the dropdowns.
- `GET /api/membership/statuses` - every status for the active company.
- `POST /api/membership/statuses` - create.
- `PATCH /api/membership/statuses/:id` - edit fields or toggle `isActive`.
- `GET /api/membership/statuses/copy-sources` - sibling companies in the **same subscription** (same Account) that have statuses, each with its statuses (for a selectable copy list).
- `POST /api/membership/statuses/copy` - clone selected statuses from a sibling company. Guards: target company must be **empty** (first-time setup only) and the source must be in the same subscription.

Copy uses `serviceContext.listSubscriptionCompanies(req)` - the seam that resolves the Account's companies (in-process now, a Control-Plane call once split), so `MembershipStatus` stays keyed by `companyId` only, with **no denormalized `accountId`** (Account<->Company grouping stays owned by the Control Plane).

Web: screen at route `/membership/statuses` (`membership-statuses` component), guarded by `systemModule: 'Membership Management'`.

**Activation (DB, done by admin - menus are maintained in the DB, not hardcoded):**
1. Ensure a **Module** named exactly `Membership Management` exists, and the club's Company is subscribed to it (`CompanyModule`).
2. Add a **Menu** under that module - name `Membership Status`, route `/membership/statuses`, an icon (e.g. `label`); optionally nest it under a `Master File Setup` parent menu.
3. Grant the club's role access to that menu (`RoleMenu`).

### Built: Membership Fee (#2)

Two tables in the `membership` schema, header + detail (a real intra-service association):
- `membership."MembershipFee"` (header, per company): `membershipFeeCode` (unique/company), `description`, `taxSchemeCode` (optional ref), `amount`, `allowInstallment`, `noOfInstallment`, `installmentInterval` (monthly/quarterly/half-yearly/annually), `isActive`.
- `membership."MembershipFeeScheme"` (detail): `membershipFeeId` (FK, cascade), `stageNo`, `amount`, `isPosted`. The fee amount is split into `noOfInstallment` stages; `isPosted` is set later by billing and preserved (by stage number) across schedule edits.

Tax Scheme is referenced **by code** and resolved through `platform/taxGateway.js` (`listCompanyTaxSchemes`) - the company-aware picker filtered by the company's country + adoption. No direct dependency on the Tax module (golden rule #4). A fee with no tax stores `taxSchemeCode = null`.

Installment schedule = **generate then edit**: the UI splits the amount equally into N stages (remainder on the last), the stages are editable, and the server rejects a save whose stages do not total the fee amount.

API (behind `verifyToken` + `requireModule('Membership Management')`):
- `GET /api/membership/fees/meta` - installment interval options.
- `GET /api/membership/fees/tax-schemes` - the active company's tax schemes (via the tax seam) for the picker.
- `GET /api/membership/fees` - fees with their stages.
- `POST /api/membership/fees` - create (header + stages, atomic).
- `PUT /api/membership/fees/:id` - full update (replaces the schedule; preserves `isPosted` per stage).
- `PATCH /api/membership/fees/:id` - toggle `isActive`.

Web: screen at `/membership/fees`. Needs the same DB activation as #1 (a Menu under Membership Management pointing at `/membership/fees`).

### Building: Membership Type (#3) - phased

Three tables planned (main + two children). **Phase 1 (main table) is built**; Phases 2-3 pending.

**Phase 1 - `membership."MembershipType"`** (main / category details + default rights, per company):
`category` (unique/company), `description`, `membershipClass` (personal | corporate - the discriminator), rights `golfingAllow` / `dependentGolfingAllow` / `votingRight` / `transferRight`, `conversionTargetIds` (uuid[] of other types it can convert to), personal-only `childAgeFrom` / `childAgeTo` / `playTimes`, corporate-only `noOfNominee` / `nomineeCategoryId`, defaults `defaultMembershipStatusId` (→ Status master) / `defaultMembershipFeeId` (→ Fee master) / `arDebtorType` (free text for now) / `creditLimit`, `isActive`.
Cross-refs are plain UUIDs validated against the company's own status/fee/type rows. Class-conditional fields are nulled server-side for the other class.
API under `/api/membership/types` (meta, list, POST, PUT, PATCH toggle). Screen `/membership/types` (Reactive Forms + dialog unsaved-changes guard).

**Phase 2 (pending) - Additional Fees** child: `transactionType` (free text), `description`, `taxSchemeCode` (OUTPUT-only via seam), `currencyCode`, `amount`.
**Phase 3 (pending) - Standing Charges** child: auto-seed one row per active Membership Status; `statusClass`, `description`, `chargesControl` (free text), `transactionType` + `description`, `taxSchemeCode`, `currencyCode`, `amount`, `frequency` (monthly/annually/fixed-month), `fixedMonth`.

Deferred masters (A/R debtor type, Transaction type, Charges control) are **free text** until their own master files exist.

### Open questions (resolve per file as requirements arrive)
- Which of these are truly tenant-scoped vs. shared platform reference data (Nationality clearly leans platform; Race/Salutation lean locale-curated).
- Whether Membership Fee is a simple lookup or a richer pricing rule (proration, tax, currency) - may outgrow a plain master file.
- Default seed sets per file, and whether any are locale-dependent (Salutation, Race).
