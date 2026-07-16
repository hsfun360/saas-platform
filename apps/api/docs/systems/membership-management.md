# Membership Management

> Status: PLANNED (stub at `src/modules/membership`, gateway seam `/api/membership`
> reserved). Tier: **Product (core system)**. Fill in as it is built.

## Purpose
Manage club members: member records, categories/tiers, dues/billing, status
(active/suspended/expired), dependents, cards. Likely the **identity anchor for the
other product systems** - Golf and Facility reference a member.

### Target market (direction, 2026-07-14)
The legacy source system targeted golf clubs; this SaaS deliberately targets ANY
membership-run business: fitness centers, facility-only clubs, loyalty/rewards
programs, and golf clubs alike.
Design rule that follows: **Membership owns the generic lifecycle** (member,
status, type, fees, billing); **each product module owns what a membership
entitles you to in that product** (golf rights belong to Golf, court booking to
Facility, points rules to a future Loyalty module) - attached by
`membershipTypeId` value reference, shown only when the company subscribes to
that module.
Known legacy leak to unwind when a second product needs type-level privileges:
`MembershipType.isGolfAllow` / `dependentGolfingAllow` / `playTimes` are
golf-specific and should migrate to a golf-side privileges table at that point.
Triage every remaining SRS item through this lens (e.g. play times -> golf;
vehicle passes and articles/newsletters -> generic).

### Member self-service portal (direction, 2026-07-14)
Members themselves log in to the system - for payments, bookings and other
self-service activities - not only staff.
Design constraints that follow (bake in when the Member master is built):
- **One identity, two surfaces:** members authenticate through the SAME Identity
  service (User table, SSO, reset, invitations); `Member.userId` is a nullable
  UUID link (no FK - identity seam). One User may map to many Member rows
  (multi-company, even multi-subscriber), like staff via CompanyUser.
- **Login branches after auth:** staff memberships (CompanyUser) -> admin shell;
  member links (Member.userId) -> a member PORTAL surface (own routes, e.g.
  `/portal/*`); a user who is both gets a choice.
- **Member authorization is NOT staff RBAC:** no roles/menus for members. Member
  endpoints sit behind a member-context guard (JWT claim "acting as member X of
  company Y") that staff middlewares reject and vice versa - a member token must
  be unusable on `/api/admin/*` by construction.
- **Runtime policy = master files:** the member's Membership Status
  `systemControl` (barred / allow / warning / warning-no-charge) gates
  transacting in the portal; the Membership Type's product privileges gate which
  activities (golf booking vs facility etc.).
- Onboarding: "send portal invitation" reuses the existing invitation +
  setup-password machinery. Members outnumber staff 10-100x; keep portal
  endpoints read-lean.

## Owns (data)
- Master files: `MembershipStatus`, `MembershipFee` (+ `MembershipFeeScheme`), `MembershipType` (+ `MembershipTypeFee`, `MembershipTypeStandingCharge`).
- CRM core (SRS 2.3 Phase 1): `Membership` (the contract/seat) and `Member` (the person - individual / nominee / dependent). See "Built: Membership / Member CRM" below.
- References `userId` and `companyId` by **UUID only** (no FK into Identity/Control
  Plane). A member may or may not map to a login `User` (`Member.userId`, the future portal link).

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

## Source specification (legacy system)

The master files and functions below derive from the 2007 Mission Hills SRS: `MH-需求规格说明书-MEM-v3.0.doc` (path: `D:\OneDrive - IFCA MSC Berhad\Documents\Customers\China\Mission Hills\System Specification\`).
Full module inventory from that spec (§ numbers are the spec's):

**§2.1 Master File Setup (主文件设置)** - 17 files:
system master (2.1.1, global params/default codes - maps to a per-company Membership Settings singleton here), member status (2.1.2, BUILT #1), membership fee (2.1.3, BUILT #2), membership type (2.1.4, BUILT #3), industry type (2.1.5, = our #4), article/club-magazine master (2.1.6), misc-attribute definitions (2.1.7, user-defined fields), hobby (2.1.8), title (2.1.9, BUILT - subscriber-level `Title` with optional country binding; `/admin/titles`, `GET /api/titles`), nationality (2.1.10, = our #6; deliberately NOT country-linked), country (2.1.11, superseded by the platform Country table), race (2.1.12, = our #7), document-numbering control (2.1.13, 凭证控制 - candidate shared capability), survey questionnaire (2.1.14) + survey form (2.1.15), special identity (2.1.16), name format (2.1.17). Salutation (our #5) appears as a field of name format / member profile, not its own file in the spec.

**§2.2 Sales Management (销售管理):** agent type, income scale, fee scale, market source, sales location masters; salesperson maintenance; prospect management (personal + corporate) with follow-up expiry/warning, sales history, remarks; member follow-up (salesperson) transfer.

**§2.3 Membership Management (会籍管理):** member/membership CRM for five member kinds - individual, corporate, nominee (corporate seat), spouse, child - with per-member: dependents, misc attributes, per-member standing-charge overrides (additional/exception on top of the type's standing charges), article subscription, hobbies, vehicle passes; ID (member no.) conversion, category conversion, status conversion (immediate) + scheduled status-conversion plan, membership transfer (with cascade rules driven by status class + system-master default statuses); member surveys.

**§2.4 Children management:** generate expiring child members, convert child -> full member, converted-children history.
**§2.5 Vehicle-pass management:** generate parking stickers (serial per year), member vehicle maintenance, issue/return/history.
**§2.6 Article management:** generate issuance from schedule, post article fees.
**§2.7 Day-End (日结)** and **§3 SUN accounting interface** - legacy-only (replaced here by the platform's own billing/outbox + a future GL export seam).

Legacy deltas worth remembering: status class was only Authorized/Unauthorized/Warning (we generalised to 10 classes on the user's requirements, with systemControl carrying the old charges-control values); fee billing intervals were bi-monthly/monthly/quarterly/semi-annually with equal/percentage/manual allocation (we shipped monthly/quarterly/half-yearly/annually + generate-then-edit).

## Master File Setup (planned)

> Status: PLANNED - list captured, per-file requirements to be provided one at a time.
> These are the configurable lookup/master tables a club sets up before day-to-day membership operations.

### Shared conventions (follow the reference-table pattern)
- Same shape as the platform reference tables (Country / Currency / Language): a stable `code`, a display `name`, an `isActive` flag, and a sort/order field.
- **Enable / disable only, never hard delete** (a record may already be referenced by a member), matching the Currency and Language screens.
- Tenant-scoped master data: each subscriber configures its own set (references `companyId` by UUID), unlike the platform-wide Country/Currency/Language tables.
- Each gets an admin maintenance screen under the Membership module and a "Load defaults" seed where a sensible default set exists.
- Where a master file overlaps an existing platform reference table, reference it rather than duplicating it (see notes below).

### RBAC (this module is the reference implementation)
The three built masters (#1-#3) carry the full three-layer authorization model -
copy this wiring for every new Membership screen:
- **Route wiring** (`membership.routes.js`): each screen's sub-router mounts
  behind `requireMenuAction('<screen route>')` on top of the module-wide
  `requireModule('Membership Management')` - the HTTP method maps to the role's
  per-menu Create/Edit/Delete grant flags.
- **Ownership stamps** (all three models): `createdBy`,
  `createdByDepartmentId` (creator's department at creation), `updatedBy`
  (every save). Create/copy paths stamp them from
  `getCallerPlacement()` + `getUserContext()`.
- **Data-scope enforcement**: every update/enable-disable path checks
  `canModifyRecord(req, row)` (403 when the caller's role data scope -
  own / department / all - does not cover the record); list responses carry a
  per-row `canModify` from `annotateCanModify()` so the frontend hides
  Edit/Enable/Disable on rows the caller cannot touch.
- **Frontend**: the screens wrap their New-FAB / Edit / Enable / Disable
  buttons in `*appCan` (menu-action gating) and honour `canModify` per row.
Full model + rule definitions: [system-administration.md](system-administration.md).

### The files (develop one by one)
| # | Master file | Intended purpose (to confirm) | Notes |
| --- | --- | --- | --- |
| 1 | Membership Status | Lifecycle state of a member (e.g. Active, Suspended, Expired, Resigned). | **BUILT** - see below. Drives entitlement/standing checks used by Golf and Facility. |
| 2 | Membership Fee | Fee/dues definitions applied to membership (amount, cycle, currency). | **BUILT** - see below. Header + installment schedule; references a Tax Scheme via the tax seam. |
| 3 | Membership Type | Category/tier of membership (e.g. Ordinary, Corporate, Life, Term). | **BUILT** - all 3 phases (main table + Additional Fees + Standing Charges). |
| 4 | Industry Type | Member's industry/business sector, for corporate members and reporting. | **PROMOTED to subscriber level + BUILT** (2026-07-14). Control-Plane `IndustryType` (accountId-scoped, one taxonomy per subscription, shared across products). Maintenance: `/auth/account/industry-types` (Tenant Admin) + screen `/admin/industry-types` (System Setup). Consumers (Membership/Golf pickers): `GET /api/industry-types` (active list, any workspace user) - store `industryTypeCode` as a value reference. |
| 5 | Salutation | Title prefix for a person (e.g. Mr, Mrs, Ms, Dr, Datuk). | **PROMOTED to subscriber level + BUILT** (2026-07-14). Control-Plane `Salutation` (accountId-scoped). Maintenance: `/auth/account/salutations` (Tenant Admin) + screen `/admin/salutations` (System Setup). Consumers: `GET /api/salutations` (active list) - store `salutationCode` as a value reference. |
| 6 | Nationality | Member's nationality. | **PROMOTED to subscriber level + BUILT** (2026-07-14). Control-Plane `Nationality` (accountId-scoped): plain code + demonym. **Deliberately NOT linked to Country** - Country is address data; a person's residential country cannot be translated to their nationality (living in Malaysia does not make someone Malaysian). Maintenance: `/auth/account/nationalities` + screen `/admin/nationalities` (System Setup). Consumers: `GET /api/nationalities` - store `nationalityCode` as a value reference. |
| 7 | Race | Member's race/ethnicity, for demographic reporting. | **PROMOTED to subscriber level + BUILT** (2026-07-14). Control-Plane `Race` (accountId-scoped, unique code per account; pure demographic vocabulary, linked to nothing else). Maintenance: `/auth/account/races` + screen `/admin/races` (System Setup). Consumers: `GET /api/races` - store `raceCode` as a value reference. Structure user-approved before build. |

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

**Phase 1 - `membership."MembershipType"`** (main / type details + default rights, per company):
`category` (the membership type code, unique/company; UI label is "Membership Type" - 2026-07-16 naming standardisation), `description`, `membershipClass` (individual | corporate - the discriminator; key migrated from the legacy `personal` on 2026-07-16, data updated in the same release), rights `isGolfAllow` (renamed from `golfingAllow` 2026-07-16; the golfing-access gate - golf settings apply/show only when true) / `dependentGolfingAllow` / `votingRight` / `transferRight`, term `isTermMembership` + `termMonths` (fixed period in MONTHS, 18 = 1.5 years, per the KLGCC term catalog; false = lifetime), `conversionTargetIds` (uuid[] of other types it can convert to), personal-only `childAgeFrom` / `childAgeTo` / `playTimes` (playTimes also requires `isGolfAllow`), corporate-only `noOfNominee` / `nomineeCategoryId`, defaults `defaultMembershipStatusId` (→ Status master) / `defaultMembershipFeeId` (→ Fee master) / `arDebtorType` (free text for now) / `creditLimit`, `isActive`.
Cross-refs are plain UUIDs validated against the company's own status/fee/type rows. Class-conditional fields are nulled server-side for the other class; golf-conditional and term-conditional fields likewise.
API under `/api/membership/types` (meta, list, POST, PUT, PATCH toggle). Screen `/membership/types` (Reactive Forms + dialog unsaved-changes guard).

**Phase 2 (BUILT) - Additional Fees** child `membership."MembershipTypeFee"`: `membershipTypeId` (FK, cascade), `transactionType` (free text), `description`, `taxSchemeCode` (OUTPUT-only, picker via the tax seam), `currencyCode` (subscriber's currency set via `serviceContext.listAccountCurrencies`, falling back to all active), `amount`.
Since 2026-07-16 these are the type's **"Joining fees"** (one-time charges billed when a new member joins - processing/entrance/...; a type can carry several) and are maintained from their OWN dialog on the listing card, saved via `PUT /api/membership/types/:id/additional-fees` (replaced wholesale - pure setup data); the type form itself no longer carries them.
Extra endpoint: `GET /api/membership/types/currencies`.
**Phase 3 (BUILT) - Standing Charges** child `membership."MembershipTypeStandingCharge"`: `membershipTypeId` (FK, cascade), `membershipStatusId` (one row per status, unique per type; status code + class displayed from the Status master), `description`, `chargesControl` (free text), `transactionType` + `transactionDescription`, `taxSchemeCode` (OUTPUT-only via seam), `currencyCode`, `amount`, `frequency` (monthly | annually | fixed-month), `fixedMonth` (1-12, required for fixed-month).
Standing charges are raised from the member's status at the point the charge is billed; statuses a club never charges (deceased/terminated/resigned/...) simply have no row.
Since 2026-07-16 they are maintained from their OWN dialog on the listing card ("Standing charges" button), saved via `PUT /api/membership/types/:id/standing-charges` (replaced wholesale); the dialog auto-seeds one row per **active** Membership Status and a row left without a transaction type is not persisted; `frequencies` served via `/types/meta`.

### Built: Transaction Type master (2026-07-16)

`membership."TransactionType"` - per-company billing-item catalog: `transactionType` (code, unique per company), `chargeType` (fixed vocabulary via `/meta`: membership-fee | standing-charges | membership-transfer | absentee-fee | miscellaneous), `description`, `taxSchemeCode` (Tax service value reference BY CODE via the tax seam - the code is the scheme's stable business identity across effective-dated versions/reseeds, so consumers never store the tax row's UUID), `isActive`, RBAC stamps.
**The transaction type is the SINGLE SOURCE of tax** for a billing item (user decision): the Joining fees and Standing charges rows dropped their own `taxSchemeCode` columns and instead PICK a transaction type from this master - Joining fees filtered to charge types membership-fee + absentee-fee, Standing charges to standing-charges (server re-validates active + charge type on save); the row's tax shows read-only from the picked type.
API `/api/membership/transaction-types` (meta / tax-schemes / list / POST / PUT / PATCH toggle) behind `requireMenuAction('/membership/transaction-types')`; picker for the Types screen served at `GET /api/membership/types/transaction-types` (avoids cross-menu RBAC). Screen `/membership/transaction-types` (menu row added by the user in the DB).

Deferred masters (A/R debtor type, Charges control) are **free text** until their own master files exist.

## Built: Membership / Member CRM (SRS 2.3 Phase 1, 2026-07-15)

The domain model (user-defined) splits the CONTRACT from the PEOPLE:

- `membership."Membership"` - the contract/seat a company sells.
  `membershipClass` `individual` | `corporate` is copied from the Membership Type and immutable (category conversion is a Phase 3 function).
  Owns the commercial side: status (+ `statusDate`), fee, join/billing dates, credit (`creditFlag` personal|combined, `creditLimit`, `terms`, `statementMode` individual|combined, reminder/interest/monthly/yearly flags), document references (`certificateNo`/`applicationNo`/`reference`/`proposer`), sales codes (free text until §2.2 Sales Management exists), the corporate company profile (name/registration/tax/contact/address), a mailing-address set, `approvalStatus` (workflow seam - always `approved` today, the planned workflow module will create `pending` and flip it), and ownership stamps (`createdBy`/`createdByDepartmentId`/`updatedBy`).
  Unique `(companyId, membershipNo)`; the number comes from **Numbering Control** (`numberingGateway.issueNumber`, purpose `membership`, `{TYPE}` = the type's category) in auto mode, or is keyed in (manual / no scheme).
- `membership."Member"` - a person. ONE table, three kinds (`memberKind`):
  `individual` (THE member of an individual membership - **auto-created in the same transaction** as the membership, member number = membership number, status mirrors the contract),
  `nominee` (a corporate seat - created under a corporate membership, capped by the type's `noOfNominee`),
  `dependent` (`dependentType` spouse|son|daughter|ward, `principalMemberId` -> its individual member OR nominee; only son/daughter/ward carry `expiryDate` - feeds §2.4 child expiry later).
  Owns the person profile: salutation/title/nationality/race/industry codes (subscriber reference-data value refs), names (first/middle/last, name-on-card, `localName` native script), gender/birth/identity no/marital (+date), contacts, employment, resident + mailing addresses, `joinDate`, per-person `memberStatusId` (+ `statusDate` - the Phase 3 cascade rules depend on each person carrying their own status), nominee `creditLimit`, and `userId` (nullable portal identity link, no FK).
  Unique `(companyId, memberNo)` across all kinds; nominee/dependent numbers default to `<parentNo>-A/B/C...` (server-suggested, editable).
  Intra-service REAL FKs: `Member.membershipId` -> Membership (no cascade delete), `Member.principalMemberId` self-FK.
  Deliberately NOT stored: raw credit-card numbers (PCI - a payment token comes with payments work); photo/signature wait for Cloud Storage (`photoUrl`/`signatureUrl` later).

Status sync (individual class): changing the membership status updates the individual member's `memberStatusId` and vice versa, in one transaction.

API (behind `verifyToken` + `requireModule('Membership Management')`):
- `/api/membership/memberships` (+ `requireMenuAction('/membership/memberships')`): `GET /meta` (vocabularies + numbering mode), `GET /options` (type/status/fee pickers in one call - avoids cross-menu RBAC on the other masters' endpoints), `GET /` (list with display name + member counts), `POST /` (create; individual requires a nested `member` profile), `GET /:id` (detail + member tree), `PUT /:id` (contract edit; number/class/type immutable), `GET /:id/members/suggest-no`, `POST /:id/members` (nominee, seat-capped), `POST /:id/members/:memberId/dependents`, `PUT /:id/members/:memberId`.
- `/api/membership/members` (+ `requireMenuAction('/membership/members')`): `GET /meta`, `GET /?q=&kind=` - flat read-only search across every person (member no / name / IC / email, capped at 200 rows).

Web: `/membership/memberships` (list with class filter chips + coloured status dot; class-aware create/edit dialog - the picked type drives individual-vs-corporate sections and defaults; a Members dialog manages the people tree with New nominee / Add dependent / Edit) and `/membership/members` (flat search screen, server-side debounced).
Both need DB Menus under Membership Management (routes `/membership/memberships`, `/membership/members`) + role grants.

Phase 2 (planned): per-member standing-charge overrides (additional/exception), hobbies / misc attributes / article subscriptions as their §2.1 masters get built.
Phase 3 (planned): ID conversion, category conversion, status conversion (immediate + scheduled plan), membership transfer - each with follow-the-principal cascades; requires the §2.1.1 Membership Settings singleton (No Conversion / Category Conversion / Transfer Resigned default statuses).
Cascade vocabulary decision pending user confirmation: cascades follow `systemControl != 'barred'` (the generalisation of legacy Authorized/Warning-follow, Unauthorized-skip).

### Open questions (resolve per file as requirements arrive)
- Which of these are truly tenant-scoped vs. shared platform reference data (Nationality clearly leans platform; Race/Salutation lean locale-curated).
- Whether Membership Fee is a simple lookup or a richer pricing rule (proration, tax, currency) - may outgrow a plain master file.
- Default seed sets per file, and whether any are locale-dependent (Salutation, Race).
