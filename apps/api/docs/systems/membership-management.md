# Membership Management

> Status: LIVE (`src/modules/membership`, gateway seam `/api/membership`, own `membership` Postgres schema).
> Tier: **Product (core system)**.
> 19 Sequelize models, 16 route files, 15 `*.schemas.js` files.

## Purpose

Manage club members: membership contracts, member persons, categories/tiers, dues/billing, status, dependents, sales agents, legacy import.
The **identity anchor for the other product systems** - Golf and AR reference a member or membership by UUID and read it through `platform/membershipGateway.js`.

### Target market (direction, 2026-07-14)

The legacy source system targeted golf clubs; this SaaS deliberately targets ANY membership-run business: fitness centers, facility-only clubs, loyalty/rewards programs, and golf clubs alike.
Design rule that follows: **Membership owns the generic lifecycle** (member, status, type, fees, billing); **each product module owns what a membership entitles you to in that product** (golf rights belong to Golf, court booking to Facility, points rules to a future Loyalty module) - attached by `membershipTypeId` value reference, shown only when the company subscribes to that module.
Known legacy leak to unwind when a second product needs type-level privileges: `MembershipType.isGolfAllow` / `dependentGolfingAllow` / `playTimes` / `guestQuota` (2026-09-28: golf guests per booking, NULL = no limit, 0 = none; guest lines and members playing as a guest count - visitors, affiliates and reciprocals do not, 2026-11-13; user chose the Membership Type master as its home, enforced at golf booking save via `membershipGateway.getGolfMemberStanding`) are golf-specific and should migrate to a golf-side privileges table at that point.
Triage every remaining SRS item through this lens (e.g. play times -> golf; vehicle passes and articles/newsletters -> generic).

### Member self-service portal (direction, 2026-07-14; Phase 0 built)

Members themselves log in to the system - for payments, bookings and other self-service activities - not only staff.
Design constraints:
- **One identity, two surfaces:** members authenticate through the SAME Identity service (User table, SSO, reset, invitations); `Member.userId` is a nullable UUID link (no FK - identity seam), LIVE since the portal registration shipped.
  One User may map to many Member rows (multi-company, even multi-subscriber), like staff via CompanyUser.
- **Login branches after auth:** staff memberships (CompanyUser) -> admin shell; member links (Member.userId) -> the member PORTAL surface (`/portal/*`); a user who is both gets a choice.
- **Member authorization is NOT staff RBAC:** no roles/menus for members.
  TODAY there is no dedicated member-context guard: the portal endpoints are mounted BEFORE the staff auth wall and `/portal/me` carries plain `verifyToken` only (the member's User holds no workspace, so `requireModule` / `requireMenuAction` never apply, and `/api/admin/*` rejects a workspace-less token at `isPlatformUser`).
  A JWT claim "acting as member X of company Y" remains the target design for member-facing transactional endpoints.
- **Runtime policy = master files:** the member's Membership Status controls gate transacting in the portal (`actionControl` for registration/booking, `chargeControl` for charge-to-account); the Membership Type's product privileges gate which activities (golf booking vs facility etc.).
- Onboarding: the welcome email's portal registration link (below).
  Members outnumber staff 10-100x; keep portal endpoints read-lean.

## Owns (data)

Every table lives in the `membership` schema; `companyId`, `userId` and the subscriber reference codes are UUID / value references (no cross-service FK); intra-service parent-child links are real FKs.

- Master files: `MembershipStatus`, `MembershipFee` (+ `MembershipFeeScheme`), `MembershipType` (+ `MembershipTypeFee`, `MembershipTypeStandingCharge`).
- CRM core: `Membership` (the contract/seat), `Member` (the person - individual / nominee / dependent), `Address` (the typed address book, owner = exactly one of `membershipId` | `memberId` | `salesAgencyId`).
- Sales: `SalesAgency`, `SalesAgent`.
- Affiliated / reciprocal clubs (2026-10-16, re-homed from golf - the Membership Department governs the club-to-club contracts, estate-wide): `AffiliatedClub` (code, name, `kind` affiliate | reciprocal, `playerTypeId` value ref to the affiliate-base golf player type its visitors are billed as, agreementFrom / agreementTo, `allowChargeToHomeClub`, `maxGuestsPerVisit`, `maxVisitsPerPlayer` + `maxVisitsPeriod` week | month | year (per member, both directions), `maxVisitsPerYear` (the club-wide annual INBOUND quota), `visitFeeTransactionTypeId` value ref to a miscellaneous golf transaction type (the host's per-visit fee, charged on the visiting member's golf bill at registration), `requiresApproval`, contact, address, remarks, isActive, sortOrder, stamps) and `AffiliatedVisit` (the Letter-of-Introduction document in BOTH directions: `direction` inbound | outbound, `visitNo` from the `membership-visit` series, club, the visitor (inbound) or our `memberId` + snapshots (outbound), letter reference + uploaded document (inbound), visitDate / alternateDate, `facilities` JSONB { golf { courseId, teeTime, holes }, dining, accommodation, sports, other }, playerCount / guestCount, `bookingProfileId` (golf value ref), workflowInstanceId, confirm / issue (issuedAt, issuedBy, sentTo) / decline / cancel / arrival (letterSightedBy, idSightedBy) / completion stamps).
  Statuses: requested -> (pending-approval ->) confirmed | declined -> arrived -> completed (inbound); requested -> issued -> completed (outbound); cancelled / expired from any open state (`affiliatedVisit.constants`).
  `affiliatedVisit.service.js`: `normalize` checks the club is active and the agreement in force, the party and guests, the per-member cap (`visitCapWindow`, unit-tested) and the club-wide annual inbound quota; INBOUND `preview` / `confirm` resolve the golf through `platform/golfGateway.js` (`previewVisitFlight`, `bookForVisit` inside the confirmation transaction - the flight is an ordinary golf booking under the visitor's golfer identity) and route through the `membership-affiliated-visit` Workflow purpose when the club or its player type requires approval (handlers in `wiring/workflowHandlers.js`: approved -> `applyConfirmation`, rejected -> `applyDecline`, cancelled chain -> requested); OUTBOUND `issue` re-checks the member's standing (`getGolfMemberStanding.actionControl`), stamps issuedAt / issuedBy / sentTo and emails `membership.visit.loi` to the partner's contact and the member; `decline` (inbound, reason) emails `membership.visit.declined`; `cancel` (reason) cancels the golf booking through the seam (refused while a player is registered); `scanVisits` on the worker tick expires open visits past their date; the desk reaches `arrive` / `registrationGate` / `completeIfSettled` / `byBooking` through `platform/membershipGateway.js`.
  Emails: `membership.visit.confirmed`, `membership.visit.declined`, `membership.visit.loi`.
- Guests (the guest-usage ledger 2026-10-25, Guest Registration 2026-11-10): `GuestVisit` (the ledger behind `MembershipType.monthlyGuestAllowance`, written by the producer modules through `platform/membershipGateway.js` and by Guest Registration itself), `Guest` (the guest person) and `GuestRegistration` (one guest, one host member, one date = one day pass).
  See "Built: Guest Registration and the day pass" below.
- The Registration Counter (2026-11-14): `GuestRegistration` is widened to every patron group (`patronGroup` guest | affiliate | reciprocal, `affiliatedVisitId`, `affiliatedClubId`; `memberId` and `guestId` nullable), `AffiliatedVisit` gains `visitDateTo` (a letter may cover several days) and `AffiliatedVisitFlight` holds the letter's golf flights, one booking per play day.
  See "Built: Registration Counter" below.
- Settings: `MembershipSetting` (Club Specification singleton), `NumberingScheme` (the `membership` purpose; shared shape from `platform/numberingSchemeDef.js`).
- Billing: `BillingSchedule`, `BillingScheduleItem` (the fee runs that post into AR).
- Import staging: `MembershipImportBatch`, `MembershipImportRow`, `MembershipTypeImportBatch`, `MembershipTypeImportRow`.
- NOT owned any more: the Transaction Type master moved to AR on 2026-08-15 (`ar.TransactionType`; the old `membership."TransactionType"` table was dropped by the boot migration).

## Public API (gateway seam: `/api/membership`)

`GET /health` is unauthenticated; `/portal/*`, `/agent-portal/*` and `GET /guest-pass/:token` are mounted BEFORE the staff auth wall; everything else sits behind `verifyToken` + `requireModule('MEMBERSHIP')` (the frozen `Module.code`, never the display name) and a per-screen `requireMenuAction`.
Every route that reads a request part mounts `validate()` with a schema from the `*.schemas.js` file beside its controller (16 files: `membership`, `member`, `membershipStatus`, `membershipFee`, `membershipType`, `membershipSetting`, `membershipTax`, `membershipImport`, `membershipTypeImport`, `salesAgency`, `salesAgent`, `transactionType`, `billing`, `dashboard`, `portal`, `guestRegistration`); upload routes validate after multer.

- `/settings` ('/membership/settings'): `GET /`, `PUT /`, `PUT /numbering`, `GET /numbering/preview`.
- `/dashboard` (per-endpoint, see Business Insights): `GET /meta`, `/summary`, `/movement`, `/breakdown`, `/agents`, `/drill`.
- `/numbering-schemes` ('/membership/numbering'): the shared `platform/numberingController.js` factory over `membership.NumberingScheme` with `MEMBERSHIP_NUMBERING_PURPOSES` (`membership`) - `GET /meta`, `GET /`, `POST /`, `PATCH /:id`, `POST /preview`, `GET /copy-sources[/:companyId]`, `POST /copy`.
- `/statuses` ('/membership/statuses'): `GET /meta`, `GET /copy-sources`, `POST /copy`, `GET /`, `POST /`, `PATCH /:id`.
- `/fees` ('/membership/fees'): `GET /meta`, `GET /tax-schemes`, `GET /transaction-types`, `GET /`, `POST /`, `PUT /:id`, `PATCH /:id`.
- `/types` ('/membership/types'): `GET /meta`, `GET /currencies`, `GET /transaction-types`, `GET /`, `POST /`, `PUT /:id`, `PATCH /:id`, `PUT /:id/additional-fees`, `PUT /:id/standing-charges`.
- `/transaction-types` ('/membership/transaction-types'): `GET /` only (the AR catalog filtered to membership-usable entries); every other method answers `410` pointing at `/ar/transaction-types`.
- `/sales-agencies` ('/membership/sales-agencies'): `GET /`, `POST /`, `PUT /:id`, `PATCH /:id`.
- `/sales-agents` ('/membership/sales-agents'): `GET /meta`, `GET /`, `POST /`, `POST /:id/invite`, `PUT /:id`, `PATCH /:id`.
- `/affiliated-clubs` ('/membership/affiliated-clubs', 2026-10-16): `GET /meta` (kinds, periods, the club-visitor golf player types - base `affiliate` or `reciprocal`, matched to the record's kind on save since 2026-11-13, a pairing saved earlier standing until its kind or type changes - and the miscellaneous golf fee items through the golf seam), `GET /`, `POST /`, `PUT /:id`, `PATCH /:id`, `DELETE /:id` (refused while visits reference the club).
- `/affiliated-visits` ('/membership/affiliated-visits', 2026-10-16): `GET /meta` · `GET /?status&direction&dateFrom&dateTo&affiliatedClubId` · `POST /` · `POST /letter` (multipart field `letter`, 5 MB) · `GET /:id` · `PUT /:id` (requested only) · `GET /:id/confirm-preview` · `POST /:id/confirm` · `POST /:id/issue` (outbound) · `POST /:id/decline { reason }` · `POST /:id/cancel { reason }` · `POST /:id/complete` · and the golf flights of a confirmed letter, one booking per play day (2026-11-14): `POST /:id/flights/preview`, `POST /:id/flights`, `POST /:id/flights/:flightId/remove`.
  The visitor's arrival is no longer a route of this router: it is recorded at the Registration Counter (below), which issues the day pass.
- `/guest-registrations` (the Registration Counter since 2026-11-14: '/membership/registration-counter', and '/membership/guest-registrations' while a Menu row still carries it): `GET /?status&group&dateFrom&dateTo` (rows of every patron group + `today`, the club's own date, + `numberingMode`, + `expectedVisits` and `clubs` for the visiting-member side) · `GET /host?memberNo&visitDate` (the host's standing and the month's allowance) · `GET /guests?q` (returning guests) · `POST /` (register; needs the Create grant) · `GET /:id` · `GET /:id/pass` (link, QR code, WhatsApp link) · and the desk actions, all `PUT` so they need the Edit grant: `PUT /:id` (correct the guest's details or remarks), `PUT /:id/cancel` (reason required), `PUT /:id/arrive`, `PUT /:id/send` (`via` email | whatsapp), `PUT /scan` (the registration behind a scanned pass; the code travels in the body because it holds the pass token).
  The visiting-member side (2026-11-14), each a `POST` that issues a new pass and needs the Create grant: `POST /visits/:id/receive { letterSighted, idSighted }`, `POST /walk-ups`, `POST /:id/guests`.
- `/guest-visits` ('/membership/guest-visits', 2026-11-10): `GET /?dateFrom&dateTo&memberNo` - the enquiry over the guest-usage ledger, every module, grouped by host member and by known guest.
- `/imports` ('/membership/import') and `/type-imports` ('/membership/type-import'): `GET /template`, `GET /`, `GET /:id`, `POST /` (multipart `file`), `POST /:id/migrate`, `DELETE /:id`.
- `/memberships` ('/membership/memberships'): `GET /meta`, `GET /options`, `POST /photo`, `GET /`, `POST /`, `GET /:id`, `PUT /:id`, `GET /:id/ar-credit[?memberId=]`, `GET /:id/members/suggest-no`, `POST /:id/members`, `POST /:id/members/:memberId/dependents`, `PUT /:id/members/:memberId`.
- `/members` ('/membership/members'): `GET /meta`, `GET /`.
- `/tax` (module gate only): `GET /schemes`, `GET /schemes/:code`, `POST /quote` - reads through `platform/taxGateway.js`.
- Billing ('/membership/billing'): `POST /billing-schedules` (generate), `GET /billing-schedules`, `GET /billing-schedules/:id`, `POST /billing-schedules/:id/post`, `POST /billing-schedules/:id/cancel`, `PATCH /billing-schedule-items/:id` (skip / restore).
- `POST /debtor-backfill` (`requireAnyMenuAction(['/ar/debtors'])` - an AR operations task).
- `/portal` (public + `verifyToken` on `/me`): `GET /register/context`, `POST /register`, `GET /me`.
- `/agent-portal` (same shape): `GET /register/context`, `POST /register`, `GET /me`.
- `GET /guest-pass/:token` (public, mounted before the auth wall; `guestPassLimiter` 300 per 15 minutes per IP and the token shape validated at the boundary): what the guest's day pass shows.
- Anything else answers `501`.

## Depends on

- Identity (JWT verify; `platform/identityGateway.js` for portal user provisioning + the 24h login token).
- Control Plane (`requireModule('MEMBERSHIP')`, menus and roles, `serviceContext.listSubscriptionCompanies` / `listAccountCurrencies` / `getActiveCompany`, the subscriber reference codes).
- Tax (`platform/taxGateway.js`: `listCompanyTaxSchemes` for pickers, `quoteTax` in the billing run).
- AR (`platform/arGateway.js`: `enqueueDebtorProvisioning`, `enqueueCreditLimitSync`, `getCreditStanding`, `listTransactionTypes` / `getTransactionType`, `isMembershipIntegrationEnabled`, `postCharge` from the billing run).
- Numbering (`platform/numberingGateway.js`: `issueNumber` inside the creation transaction, `getMode`, `getScheme` / `saveScheme` / `previewScheme` for Club Specification).
- Notification (outbox, all as `EmailQueued`): `membership.welcome`, `sales-agent.invite`.
- Outbox events produced: `DebtorProvisionRequested` and `DebtorCreditLimitSyncRequested` (through `arGateway`, from `arProvisioning.js`).
  There are no `MemberCreated` / `MembershipRenewed` / `MembershipExpired` events.
- Workflow: the `membership-application` purpose exists in `workflow.constants.js` and `Membership.approvalStatus` is always `approved` today, but no submit flow calls `workflowGateway` and no handler is registered.

## Consumed by

The seam is `platform/membershipGateway.js` - nine exports, all in-process reads keyed by `companyId`: `lookupPartyDisplay`, `searchPartyIds`, `getChargeTarget`, `countTransactionTypeReferences`, `listDebtorPersons`, `lookupPartyBilling`, `classifyParties`, `listMembershipTypes`, `getGolfMemberStanding`.
- **Account Receivable**: party display + search for the Debtor Listing, billing names/addresses and classification for statements, the incurred-by person list, the catalog reference guard.
- **Golf**: `getGolfMemberStanding` (identity, effective type with `isGolfAllow` / `guestQuota`, `actionControl` / `chargeControl`, gender, birth date, nationality, junior flag + principal) at booking, registration and billing; `getChargeTarget` for charge-to-account; `listMembershipTypes` for the Golf Specification override picker.
- Facility: not built; will use the same seam.

## Source specification (legacy system)

The master files and functions below derive from the 2007 Mission Hills SRS: `MH-需求规格说明书-MEM-v3.0.doc` (path: `D:\OneDrive - IFCA MSC Berhad\Documents\Customers\China\Mission Hills\System Specification\`).
Full module inventory from that spec (§ numbers are the spec's):

**§2.1 Master File Setup (主文件设置)** - 17 files:
system master (2.1.1, global params/default codes - maps to a per-company Membership Settings singleton here; phase 1 BUILT 2026-07-20 as **Club Specification** - see "Built: Club Specification" below), member status (2.1.2, BUILT #1), membership fee (2.1.3, BUILT #2), membership type (2.1.4, BUILT #3), industry type (2.1.5, = our #4), article/club-magazine master (2.1.6), misc-attribute definitions (2.1.7, user-defined fields), hobby (2.1.8), title (2.1.9, BUILT - subscriber-level `Title` with optional country binding; `/admin/titles`, `GET /api/titles`), nationality (2.1.10, = our #6; deliberately NOT country-linked), country (2.1.11, superseded by the platform Country table), race (2.1.12, = our #7), document-numbering control (2.1.13, 凭证控制 - built as the per-module Numbering Control), survey questionnaire (2.1.14) + survey form (2.1.15), special identity (2.1.16), name format (2.1.17).
Salutation (our #5) appears as a field of name format / member profile, not its own file in the spec.

**§2.2 Sales Management (销售管理):** agent type + salesperson maintenance (phase 1 BUILT 2026-07-20 as SalesAgency + SalesAgent with fixed agentKind - see "Built: Sales Agent module" below); income scale, fee scale (commission - needs AR), market source, sales location masters; prospect management (personal + corporate) with follow-up expiry/warning, sales history, remarks; member follow-up (salesperson) transfer - all still pending.

### Club types (user domain context, 2026-07-20)

Two admission models exist; both are configuration of ONE product, never separate products:
- **Committee club** (Royal Selangor GC, Royal Lake Club): proposal -> interview -> provision -> full member, with Proposer AND Seconder vouching; a temporary "Committee membership" type held only while serving a committee position.
  Maps to the `approvalStatus` workflow seam + provisional statuses + the category conversion function.
  No sales agents.
  (Gap noted: we carry `proposer` but no `seconder` yet - committee-club track.)
- **Commercial club** (KLGCC, Tropicana, fitness clubs): pay-to-join; **Sales Agents** are the acquisition channel - §2.2 is their feature.
  Proposer/Seconder unused.

### Built: Sales Agent module (§2.2 phase 1, 2026-07-20)

Three-tier sales channel (user's model, for fitness/commercial clubs): **Sales Agency** (outsourced agency company; 1..n per club), **agency staff**, **external individual** (freelancer), **internal sales staff**.

- `membership."SalesAgency"` - id, companyId, agencyCode (unique/company), agencyName, registrationNo, contactPerson, phone/mobile/email, isActive (disable-only), RBAC stamps.
  The agency's OFFICE ADDRESS (2026-07-20) is a `membership."Address"` row via the table's third owner column `salesAgencyId` (type 'company', one per agency, replace-set on save, cascades with the agency; an empty street line removes it).
  The dialog groups **Agency** (code/name/registration + address - the address belongs to the AGENCY, per the user, never under Contact) and **Contact** (person/email/phone/mobile) as collapsible sections.
- `membership."SalesAgent"` - ONE table for every salesperson: id, companyId, agentCode (unique/company), name, `agentKind` (FIXED vocabulary `agency-staff` | `external` | `internal` - structural, so not a user-editable master; the spec's "agent type" collapses into it), `salesAgencyId` (required for agency-staff, real intra-service FK, no cascade), identityNo, phone/mobile, email (REQUIRED - the invite target), joinedDate/leftDate, isActive, **userId** (Identity seam - the login link), remarks, RBAC stamps, index on userId.
- **Login for all kinds** (user requirement): staff sends "Invite to login" (`POST /sales-agents/:id/invite`) -> `sales-agent.invite` email template (tenant-overridable) with a stateless RS256 link (purpose `sales-agent-register`, 30d) -> `/agent/register` sets a password -> `identityGateway.provisionPortalUser` find-or-creates the platform User and stamps `SalesAgent.userId` (an existing account, e.g. internal staff, is linked WITHOUT touching its password).
- **Cross-club by design** (user requirement): an agency/freelancer serving many clubs - across companies AND subscriber accounts - is a SalesAgent row per club, all linked to ONE User by email; `GET /agent-portal/me` returns every engagement of the login, so `/agent` (outside the staff shell) lists them all.
  Master data itself stays per-club (no shared agency registry - tenant isolation; identity joins only at the person level).
- Membership linkage: free-text `salesCode`/`followupSalesCode` were REPLACED by `Membership.salesAgentId` (closed the sale, future commission driver) + `Membership.followupSalesAgentId` (currently servicing; the transfer function reassigns) - plain UUIDs validated in the app against the company's agents; the dialog picks from `GET /memberships/options` `agents`.
  Old columns dropped 2026-07-20.
- API: `/api/membership/sales-agencies` + `/sales-agents` behind `requireMenuAction` (routes `/membership/sales-agencies`, `/membership/sales-agents` - DB menus added by the user); `/api/membership/agent-portal/*` mounted BEFORE the staff auth wall (register public, /me verifyToken-only).
- NOT in this phase: commission scales (income/fee scale - needs AR), market source, sales location, prospect pipeline, follow-up transfer function.

### Built: Club Specification (§2.1.1 phase 1, 2026-07-20)

The membership system master, modernised: the club declares WHAT KIND of club it is, and the entry screens show only the fields that apply (the user's four dimensions: club type, committee vs commercial, sales channels, auto vs manual numbering).
Like the legacy system master it is modify-only ("设好后不能增加记录，仅能修改记录"): the row is find-or-created with safe defaults on first read - never listed, never deleted, no `isActive`.

- `membership."MembershipSetting"` - per-company SINGLETON (unique `companyId`): `clubType` (`golf` | `leisure` | `others`, fixed vocabulary), `isCommittee`, `creditFacilityEnabled` (can members charge expenses to their account; default true), `nomineeNoSuffix` / `dependentNoSuffix` (child-number patterns, below), `salesAgencyEnabled` / `salesExternalEnabled` / `salesInternalEnabled` (forced false while `isCommittee` - committee clubs have no sales agents), RBAC stamps (nullable - the row may be system-created before anyone edits).
  Defaults (`golf`, commercial, all channels on) keep every existing club exactly as it behaved before this shipped.
- Resolution ALWAYS goes through `membershipSetting.service.js` (`getSettings` / `enabledAgentKinds`) so find-or-create stays in one place.
- **Gating map:** committee -> membership entry shows Proposer, hides both salesperson pickers; commercial -> the reverse, and `GET /memberships/options` ships `settings` + filters `agents` to the enabled kinds; the Sales Agents screen's meta ships only the enabled kinds (existing rows of a since-disabled kind still display via a label fallback); the Membership Type master hides "Golfing access" (and its dependents) unless `clubType = 'golf'` (`/types/meta` ships `settings`).
- **Credit facility gate (`creditFacilityEnabled`, 2026-08-03):** when off, the membership dialog hides every credit term (credit flag, credit limit, terms, statement, arrears reminders, late-payment interest - the Monthly/Yearly fee flags stay), the nominee credit limit is hidden, and the Membership Type master hides its default credit limit.
  The server enforces it whatever the client sent: `forceCreditTermsOff` on membership create/update stores credit limit 0 (not NULL) with the other terms nulled/false, member create/update forces the member credit limit to 0, and the type's default credit limit is not applied on create.
  **The Excel import migration applies the same gate (2026-08-21, closing a gap):** legacy spreadsheet credit values are deliberately NOT preserved when the facility is off - they would seed AR's `CreditAccount` at debtor provisioning; a club that later enables the facility maintains credit terms on the AR Debtor screen.
  Staging validation warns on rows whose credit columns are filled so the review shows they will be ignored.
- **Credit-limit ownership split (user decision 2026-09-27):** the Membership department OWNS member-account credit limits.
  A membership save whose credit limit changed (and a nominee save, for their personal account) enqueues `DebtorCreditLimitSyncRequested` through `platform/arGateway.enqueueCreditLimitSync` (`arProvisioning.syncContractCreditLimit` / `syncNomineeCreditLimit`), pushing the value into AR's `CreditAccount` pool - the limit the credit gate actually enforces - so the two never diverge after provisioning.
  AR silently no-ops when no ledger account exists yet (provisioning seeds the value later), so producers fire on every change without checking.
  Finance keeps ONLY Other Debtor limits on the AR Debtor screen (the AR `PATCH /debtors/:id` rejects member-account limit edits).
  The membership/nominee dialogs show the live pool beside the credit-limit field (`GET /memberships/:id/ar-credit[?memberId=]` -> `arGateway.getCreditStanding`).
  Repayment terms / reminders / interest stay AR-owned after seeding, unchanged.
- **`isMembershipAutoNumber` is deliberately NOT a column** - the auto/manual fact is owned by Numbering Control (`NumberingScheme.mode`) and is surfaced/edited through `platform/numberingGateway.js` (`numberingMeta` / `getScheme` / `saveScheme` / `previewScheme`, with the config validation in `saas/numberingScheme.service.js` so the rules cannot drift from the `/membership/numbering` screen).
- API `/api/membership/settings` (GET, PUT, PUT `/numbering`, GET `/numbering/preview` - preview is a GET so a view-only grant can render it) behind `requireMenuAction('/membership/settings')`.
- Screen `/membership/settings` "Club Specification": consequence-captioned option rows (each toggle states what the entry screens will hide - the show-expected-results principle), sales channels section hidden while Committee is on, numbering toggle + "Configure format" dialog (prefix / format tokens / sequence digits / starting number / reset rule + live next-number preview, mirroring the Numbering Control dialog).
  Menu row added in the DB by the user.
- Future §2.1.1 fields (conversion default statuses, nominee expiration days, follow-principal statuses) become MORE columns on this same singleton when the conversions phase lands.

### Built: Membership import (Excel -> staging -> selective migration, 2026-07-28)

Legacy-data onboarding: a club uploads its existing membership base from a two-sheet Excel workbook, reviews it in a staging "mid-table", and migrates only the records it selects.

- **Template** (downloadable, built with exceljs): sheet `Memberships` (one row per contract - individual AND corporate; class derives from the Type Code) + sheet `Members` (one row per person - individual / nominee / dependent, linked by Membership No, dependents by Principal Member No - renamed from "Parent Member No" 2026-08-20 with the old header kept as a parser alias so downloaded templates never break).
  Column specs live ONCE in `membershipImport.service.js` and drive both the template and the parser (headers matched case-insensitively via header + aliases, extra/reordered columns tolerated); both sheets carry optional residential + mailing address sets.
- **Staging**: `membership."MembershipImportBatch"` (per file: `fileName`, `totalMemberships`, `totalMembers`, RBAC stamps) + `membership."MembershipImportRow"` (per Excel row: `rowKind` membership|member, `rowNo`, linking keys `membershipNo` / `memberNo` / `parentMemberNo`, `data` JSONB, `issues` JSONB [{level: error|warning, message}], `isValid`, `migrateStatus` pending|migrated, `migratedId`/`migratedAt`).
  Real FK batch->rows with CASCADE - deleting a batch clears staging only, never real data.
- **Validation at upload** (re-checked at migration): unknown type/status/fee/agent codes, vocab (kind, dependent type, gender, marital, credit flag, statement mode), dates, corporate name, duplicate numbers within the file AND against the real tables (**existing numbers block as errors - imports never update existing records**, user decision 2026-07-28), individual membership must have exactly one individual member row, nominee seat caps vs the type, dependent parent resolution, manual-numbering clubs must supply numbers.
  Errors block; warnings don't.
  A membership is selectable only when it AND all its member rows are clean.
- **Migration** (`POST /imports/:id/migrate` with the selected staged membership row ids): the SELECTION UNIT IS THE MEMBERSHIP - contract + its members move together in one transaction per membership (one failure never rolls back the others).
  Same invariants as manual entry: type defaults for status/fee/credit/term-expiry (day-before-anniversary), statusDate today, approvalStatus approved, addresses to the typed Address book, member numbers derived when blank (individual = membership no; children per the suffix rules), file numbers win; a blank number on an auto-numbering club issues gaplessly through the numbering gateway INSIDE the tx.
  **NO welcome/portal emails are sent** (user decision 2026-07-28 - legacy members migrate silently; a per-member portal invite can come later).
  Active contracts and nominees enqueue `DebtorProvisionRequested` without `requestedBy` (bulk path, no bells).
- API `/api/membership/imports` (GET template/list/:id, POST upload multipart 10 MB in-memory / :id/migrate, DELETE :id) behind `requireMenuAction('/membership/import')`; screen `/membership/import` (+`/:id` review, URL-driven): template download + upload, batch cards with progress (Staged/Partial/Completed), review grouped per membership with inline issues and Excel row numbers, valid memberships preselected, "Migrate N membership(s) / M member(s)" button, per-membership failure report, orphan member rows called out.
  Menu row added in the DB by the user.

### Built: Membership Type import (Excel -> staging -> selective migration, 2026-08-04)

The same staging pattern applied to the Membership Type master: one-sheet workbook (`Membership Types`), staged review, selective migration.
Joining fees and standing charges are NOT part of the import - they stay maintained through their own dialogs on the Types screen.

- **Template/parse**: column specs live ONCE in `membershipTypeImport.service.js`; the Excel plumbing (cell/number/bool coercion, sheet parsing) is REUSED from `membershipImport.service.js` exports so the rules can never drift.
- **Staging**: `membership."MembershipTypeImportBatch"` (per file, `totalTypes`, RBAC stamps) + `membership."MembershipTypeImportRow"` (`rowNo`, lifted `category` key, `data`/`issues` JSONB, `isValid`, `migrateStatus` pending|migrated, `migratedId`/`migratedAt`), FK batch->rows CASCADE - deleting a batch clears staging only.
- **Validation** mirrors the manual screen's `normalizeTypeBody`: category required/unique-in-file/**existing categories block (imports never update)**, class vocabulary, term months required when Term Membership = Y, integer/money rules, child-age ordering, Default Status / Default Fee resolved against their masters; class- and golf-conditional fields that migration will null raise warnings, not errors.
- **Type references may point at other rows in the SAME file**: Nominee Category Code and the comma-separated Convert To Codes resolve against existing types OR file rows.
  Migration is two-pass - pass 1 creates each selected type in its own transaction, pass 2 links the references against everything that now exists; a reference to a not-yet-migrated file row leaves the type created with the result message saying to migrate the referenced type and re-link on the Types screen.
- API `/api/membership/type-imports` (same endpoint shape as `/imports`) behind `requireMenuAction('/membership/type-import')`; screen `/membership/type-import` (+`/:id`), cloned from the membership import screen (flat row cards instead of groups).
  Menu row added in the DB by the user.

**§2.3 Membership Management (会籍管理):** member/membership CRM for five member kinds - individual, corporate, nominee (corporate seat), spouse, child - with per-member: dependents, misc attributes, per-member standing-charge overrides (additional/exception on top of the type's standing charges), article subscription, hobbies, vehicle passes; ID (member no.) conversion, category conversion, status conversion (immediate) + scheduled status-conversion plan, membership transfer (with cascade rules driven by status class + system-master default statuses); member surveys.

**§2.4 Children management:** generate expiring child members, convert child -> full member, converted-children history.
**§2.5 Vehicle-pass management:** generate parking stickers (serial per year), member vehicle maintenance, issue/return/history.
**§2.6 Article management:** generate issuance from schedule, post article fees.
**§2.7 Day-End (日结)** and **§3 SUN accounting interface** - legacy-only (replaced here by the platform's own billing/outbox + a future GL export seam).

Legacy deltas worth remembering: status class was only Authorized/Unauthorized/Warning (we generalised to 10 classes on the user's requirements, with systemControl carrying the old charges-control values); fee billing intervals were bi-monthly/monthly/quarterly/semi-annually with equal/percentage/manual allocation (we shipped monthly/quarterly/half-yearly/annually + generate-then-edit).

## Master File Setup

The configurable lookup/master tables a club sets up before day-to-day membership operations.
All seven are built; four were promoted to the Control Plane.

### Shared conventions (follow the reference-table pattern)
- Same shape as the platform reference tables (Country / Currency / Language): a stable `code`, a display `name`, an `isActive` flag, and a sort/order field.
- **Enable / disable only, never hard delete** (a record may already be referenced by a member), matching the Currency and Language screens.
- Tenant-scoped master data: each subscriber configures its own set (references `companyId` by UUID), unlike the platform-wide Country/Currency/Language tables.
- Each gets an admin maintenance screen under the Membership module and a "Load defaults" seed where a sensible default set exists.
- Where a master file overlaps an existing platform reference table, reference it rather than duplicating it (see notes below).

### RBAC (this module is the reference implementation)
The three built masters (#1-#3) carry the full three-layer authorization model - copy this wiring for every new Membership screen:
- **Route wiring** (`membership.routes.js`): each screen's sub-router mounts behind `requireMenuAction('<screen route>')` on top of the module-wide `requireModule('MEMBERSHIP')` - the HTTP method maps to the role's per-menu Create/Edit/Delete grant flags.
- **Ownership stamps** (all models): `createdBy`, `createdByDepartmentId` (creator's department at creation), `updatedBy` (every save).
  Create/copy paths stamp them from `getCallerPlacement()` + `getUserContext()`.
- **Data-scope enforcement**: every update/enable-disable path checks `canModifyRecord(req, row)` (403 when the caller's role data scope - own / department / all - does not cover the record); list responses carry a per-row `canModify` from `annotateCanModify()` (it returns one boolean per row and also stamps each Sequelize row, so a DTO builder may take `flags[i]` or read `row.get('canModify')`) so the frontend hides Edit/Enable/Disable on rows the caller cannot touch.
- **Frontend**: the screens wrap their New-FAB / Edit / Enable / Disable buttons in `*appCan` (menu-action gating) and honour `canModify` per row.
Full model + rule definitions: [system-administration.md](system-administration.md).

### The files
| # | Master file | Intended purpose | Notes |
| --- | --- | --- | --- |
| 1 | Membership Status | Lifecycle state of a member (e.g. Active, Suspended, Expired, Resigned). | **BUILT** - see below. Drives entitlement/standing checks used by Golf and AR. |
| 2 | Membership Fee | Fee/dues definitions applied to membership (amount, cycle). | **BUILT** - see below. Header + installment schedule; references an AR transaction type by id and a Tax Scheme by code via the tax seam. |
| 3 | Membership Type | Category/tier of membership (e.g. Ordinary, Corporate, Life, Term). | **BUILT** - all 3 phases (main table + Joining Fees + Standing Charges). |
| 4 | Industry Type | Member's industry/business sector, for corporate members and reporting. | **PROMOTED to subscriber level + BUILT** (2026-07-14). Control-Plane `IndustryType` (accountId-scoped, one taxonomy per subscription, shared across products). Maintenance: `/auth/account/industry-types` (Tenant Admin) + screen `/admin/industry-types` (System Setup). Consumers (Membership/Golf pickers): `GET /api/industry-types` (active list, any workspace user) - store `industryTypeCode` as a value reference. |
| 5 | Salutation | Title prefix for a person (e.g. Mr, Mrs, Ms, Dr, Datuk). | **PROMOTED to subscriber level + BUILT** (2026-07-14). Control-Plane `Salutation` (accountId-scoped). Maintenance: `/auth/account/salutations` (Tenant Admin) + screen `/admin/salutations` (System Setup). Consumers: `GET /api/salutations` (active list) - store `salutationCode` as a value reference. |
| 6 | Nationality | Member's nationality. | **PROMOTED to subscriber level + BUILT** (2026-07-14). Control-Plane `Nationality` (accountId-scoped): plain code + demonym. **Deliberately NOT linked to Country** - Country is address data; a person's residential country cannot be translated to their nationality (living in Malaysia does not make someone Malaysian). Maintenance: `/auth/account/nationalities` + screen `/admin/nationalities` (System Setup). Consumers: `GET /api/nationalities` - store `nationalityCode` as a value reference. |
| 7 | Race | Member's race/ethnicity, for demographic reporting. | **PROMOTED to subscriber level + BUILT** (2026-07-14). Control-Plane `Race` (accountId-scoped, unique code per account; pure demographic vocabulary, linked to nothing else). Maintenance: `/auth/account/races` + screen `/admin/races` (System Setup). Consumers: `GET /api/races` - store `raceCode` as a value reference. Structure user-approved before build. |

### DB isolation - own Postgres schema

Every Membership Management table lives in the dedicated **`membership`** Postgres schema (e.g. `membership."MembershipStatus"`), not `public`.
This is the physical half of the microservice seam: the service extracts later with a clean `pg_dump --schema=membership` into its own database, with no table renames and no app changes.
Implemented via `schema: MEMBERSHIP_SCHEMA` on each model (see `src/platform/schemas.js`); the schema is created before the fingerprint-gated `sequelize.sync()` in `app.js`.
Golf (`golf`) and AR (`ar`) follow the same pattern; platform / control-plane tables stay in `public` for now.

### Built: Membership Status (#1)

Per-company master file.
Owner table `membership."MembershipStatus"` (references `companyId` by UUID, no FK).

Fields: `membershipStatus` (the status value, unique per company - the legacy code-base "status code", renamed since the PK is the UUID `id`), `statusClass` (fixed vocabulary), `description`, `actionControl` + `chargeControl` (fixed vocabularies, see below), `statusColor` (hex, new-record default black), `isActive` (enable/disable, no hard delete), stamps.

Fixed vocabularies (stored as the `key`, served to the UI via `/meta` so dropdowns never drift from server validation) - defined in `membershipStatus.constants.js`:
- **Status class:** active, provisional, resigned, decease, terminate, absent, suspend, defaulter, expired, active-absent.
- **Action control** (frontend registration/booking/check-in): allow, warning, barred.
  Warning proceeds with an operator alert.
- **Charge control** (charge-to-account at settlement; cash/card settlement is never checked): allow, warning, barred.
  Warning alerts the operator but still posts - the advisory stage before the club converts the member to a truly barred status (user decision 2026-08-09); the AR credit-headroom check runs AFTER charge control, in the `authorizeCharge` / `postCharge({ enforceCredit })` seam.
  Billing runs (membership fee / subscription) deliberately do NOT check charge control - billing reality is never blocked.

**`systemControl` SPLIT 2026-08-09** into the two columns above (the composite 'warning-no-charge' value conflated the axes).
A boot backfill mapped legacy values (allow -> allow/allow, warning -> warning/warning since the legacy field WAS the charges control, warning-no-charge -> warning/barred, barred -> barred/barred) on dev and staging, then the column was RETIRED same day: removed from the model, backfill removed, physical column dropped manually per environment once its API ran the new image.
No consumer ever read `systemControl`, so nothing else changed.

API (all behind `verifyToken` + `requireModule('MEMBERSHIP')` + `requireMenuAction('/membership/statuses')`):
- `GET /api/membership/statuses/meta` - the option lists for the dropdowns.
- `GET /api/membership/statuses` - every status for the active company.
- `POST /api/membership/statuses` - create.
- `PATCH /api/membership/statuses/:id` - edit fields or toggle `isActive`.
- `GET /api/membership/statuses/copy-sources` - sibling companies in the **same subscription** (same Account) that have statuses, each with its statuses (for a selectable copy list).
- `POST /api/membership/statuses/copy` - clone selected statuses from a sibling company.
  Guards: target company must be **empty** (first-time setup only) and the source must be in the same subscription.

Copy uses `serviceContext.listSubscriptionCompanies(req)` - the seam that resolves the Account's companies (in-process now, a Control-Plane call once split), so `MembershipStatus` stays keyed by `companyId` only, with **no denormalized `accountId`** (Account<->Company grouping stays owned by the Control Plane).

Web: screen at route `/membership/statuses` (`membership-statuses` component), guarded by the Membership module.

**Activation (DB, done by admin - menus are maintained in the DB, not hardcoded):**
1. Ensure the **Module** with code `MEMBERSHIP` exists, and the club's Company is subscribed to it (`CompanyModule`).
2. Add a **Menu** under that module - name `Membership Status`, route `/membership/statuses`, an icon (e.g. `label`); optionally nest it under a `Master File Setup` parent menu.
3. Grant the club's role access to that menu (`RoleMenu`).

### Built: Membership Fee (#2)

Two tables in the `membership` schema, header + detail (a real intra-service association):
- `membership."MembershipFee"` (header, per company): `membershipFeeCode` (unique/company), `description`, `taxSchemeCode` (optional ref), `transactionTypeId` (the AR catalog entry the fee run posts under - explicit since 2026-08-15, backfilled from the old auto-pick), `amount`, `allowInstallment`, `noOfInstallment`, `installmentInterval` (monthly/quarterly/half-yearly/annually), `isActive`, stamps.
- `membership."MembershipFeeScheme"` (detail): `membershipFeeId` (FK, cascade), `stageNo`, `amount`, `isPosted`.
  The fee amount is split into `noOfInstallment` stages; `isPosted` is set later by billing and preserved (by stage number) across schedule edits.

Tax Scheme is referenced **by code** and resolved through `platform/taxGateway.js` (`listCompanyTaxSchemes`) - the company-aware picker filtered by the company's country + adoption.
No direct dependency on the Tax module (golden rule #4).
A fee with no tax stores `taxSchemeCode = null`.
The transaction-type picker (`GET /fees/transaction-types`) reads the AR catalog through `arGateway.listTransactionTypes({ module: 'membership', trxClass: 'invoice' })`.

Installment schedule = **generate then edit**: the UI splits the amount equally into N stages (remainder on the last), the stages are editable, and the server rejects a save whose stages do not total the fee amount.

API (behind `verifyToken` + `requireModule('MEMBERSHIP')` + `requireMenuAction('/membership/fees')`):
- `GET /api/membership/fees/meta` - installment interval options.
- `GET /api/membership/fees/tax-schemes` - the active company's tax schemes (via the tax seam) for the picker.
- `GET /api/membership/fees/transaction-types` - the membership-usable invoice-class AR catalog entries.
- `GET /api/membership/fees` - fees with their stages.
- `POST /api/membership/fees` - create (header + stages, atomic).
- `PUT /api/membership/fees/:id` - full update (replaces the schedule; preserves `isPosted` per stage).
- `PATCH /api/membership/fees/:id` - toggle `isActive`.

Web: screen at `/membership/fees`.
Needs the same DB activation as #1 (a Menu under the Membership module pointing at `/membership/fees`).

### Built: Membership Type (#3) - all three phases

**Phase 1 - `membership."MembershipType"`** (main / type details + default rights, per company):
`category` (the membership type code, unique/company; UI label is "Membership Type" - 2026-07-16 naming standardisation), `description`, `membershipClass` (individual | corporate - the discriminator; key migrated from the legacy `personal` on 2026-07-16, data updated in the same release), rights `isGolfAllow` (renamed from `golfingAllow` 2026-07-16; the golfing-access gate - golf settings apply/show only when true) / `dependentGolfingAllow` / `guestQuota` / `votingRight` / `transferRight`, term `isTermMembership` + `termMonths` (fixed period in MONTHS, 18 = 1.5 years, per the KLGCC term catalog; false = lifetime), `conversionTargetIds` (uuid[] of other types it can convert to), personal-only `childAgeFrom` / `childAgeTo` / `playTimes` (playTimes also requires `isGolfAllow`), corporate-only `noOfNominee` / `nomineeCategoryId`, defaults `defaultMembershipStatusId` (-> Status master) / `defaultMembershipFeeId` (-> Fee master) / `arDebtorType` (free text for now) / `creditLimit`, `isActive`, stamps.
Cross-refs are plain UUIDs validated against the company's own status/fee/type rows.
Class-conditional fields are nulled server-side for the other class; golf-conditional and term-conditional fields likewise.
API under `/api/membership/types` (meta, currencies, transaction-types, list, POST, PUT, PATCH toggle).
Screen `/membership/types` (Reactive Forms + dialog unsaved-changes guard).

**Phase 2 (BUILT) - Joining fees** child `membership."MembershipTypeFee"`: `membershipTypeId` (FK, cascade), `transactionType` (an AR catalog CODE - the single source of the line's tax and description), `description`, `currencyCode` (subscriber's currency set via `serviceContext.listAccountCurrencies`, falling back to all active), `amount`.
There is NO `taxSchemeCode` on this row (dropped 2026-07-16 - tax is single-sourced from the transaction type).
Since 2026-07-16 these are the type's **"Joining fees"** (one-time charges billed when a new member joins - processing/entrance/...; a type can carry several) and are maintained from their OWN dialog on the listing card, saved via `PUT /api/membership/types/:id/additional-fees` (replaced wholesale - pure setup data); the type form itself no longer carries them.
Extra endpoint: `GET /api/membership/types/currencies`.
**Phase 3 (BUILT) - Standing Charges** child `membership."MembershipTypeStandingCharge"`: `membershipTypeId` (FK, cascade), `membershipStatusId` (non-unique - a status may carry several charges since 2026-07-16), `description`, `transactionType` (AR catalog code - carries the tax AND the billing-line description), `currencyCode`, `amount`, `frequency` (monthly | annually | fixed-month), `fixedMonth` (1-12, required for fixed-month).
Dropped columns (2026-07-16, user decision): `taxSchemeCode` (tax single-sourced from the transaction type), `transactionDescription` (redundant with the master's description) and `chargesControl` (drove nothing yet - reintroduce with its own master when the billing/posting engine defines posting-control rules).
Standing charges are raised from the member's status at the point the charge is billed; statuses a club never charges (deceased/terminated/resigned/...) simply have no row.
Since 2026-07-16 they are maintained from their OWN dialog on the listing card ("Standing charges" button), saved via `PUT /api/membership/types/:id/standing-charges` (replaced wholesale); `frequencies` served via `/types/meta`.
UX rework (same day, user direction): NO pre-populated per-status grid - charges are added explicitly ("Add charge", like joining fees), each row picks its Membership Status AND transaction type, and a status may carry MULTIPLE charges (the unique `(membershipTypeId, membershipStatusId)` index was dropped and recreated non-unique); statuses never charged simply have no rows.
The picker for both dialogs is `GET /api/membership/types/transaction-types` (avoids cross-menu RBAC on the AR master) - the AR catalog filtered to membership-usable entries through `arGateway`.

### Transaction Type master - MOVED TO AR (2026-08-15)

The per-company billing-item catalog that was `membership."TransactionType"` (2026-07-16) is now `ar.TransactionType` - see [account-receivable.md](account-receivable.md) "Transaction Type catalog".
What remains on the membership side:
- `GET /api/membership/transaction-types` (behind `/membership/transaction-types`) is a READ-ONLY view of the entries whose `usableInModules` contains `membership`, through `arGateway.listTransactionTypes`; every write method answers `410` pointing at `/ar/transaction-types`.
- There is no `chargeType` any more: joining fees, standing charges and fee masters pick any membership-usable invoice-class entry; the old `membership-fee | standing-charges | membership-transfer | absentee-fee | miscellaneous` vocabulary is gone.
- Fee masters reference the catalog by ID (`MembershipFee.transactionTypeId`), joining fees and standing charges by CODE; `membershipGateway.countTransactionTypeReferences` lets the AR master refuse to remove `membership` usability while setups still reference a type.
- The boot migration copied the rows id-preserving (trxClass mapped by code), backfilled the fee masters and the AR Setting rows, then dropped the membership table.

Deferred masters: A/R debtor type stays **free text** on the type until its master file exists; Charges control was removed from the screens entirely (2026-07-16) and returns with its own master when billing/posting is designed.

## Built: Membership / Member CRM (SRS 2.3 Phase 1, 2026-07-15)

The domain model (user-defined) splits the CONTRACT from the PEOPLE:

- `membership."Membership"` - the contract/seat a company sells.
  `membershipClass` `individual` | `corporate` is copied from the Membership Type and immutable (category conversion is a conversions-phase function).
  Owns the commercial side: `membershipTypeId`, `membershipStatusId` (+ `statusDate`), `membershipFeeId`, `joinDate`, `expiryDate`, `billingDate`, credit (`creditFlag` personal|combined, `creditLimit`, `terms`, `statementMode` individual|combined, `sendReminders`, `chargeInterest`, `monthlyFee`, `yearlyFee`, `nomineeSubscriptionBorneByCompany`), document references (`certificateNo`/`applicationNo`/`reference`/`proposer`), `salesAgentId` / `followupSalesAgentId` (UUIDs into `SalesAgent`), the corporate company profile (`corporateName`, `registrationNo`, `taxNo`, `contactPerson`, `contactDesignation`, phone/fax/mobile/email, `industryTypeCode`), `approvalStatus` (+ `approvedAt`/`approvedBy`; the workflow seam - always `approved` today, the `membership-application` purpose is declared but not wired), `remarks`, and ownership stamps (`createdBy`/`createdByDepartmentId`/`updatedBy`).
  Unique `(companyId, membershipNo)`; the number comes from **Numbering Control** (`numberingGateway.issueNumber`, purpose `membership`, `{TYPE}` = the type's category) in auto mode, or is keyed in (manual / no scheme).
  **Gapless auto numbering (2026-07-20):** the issue runs INSIDE the creation transaction (`issueNumber(..., { transaction })` -> `numberingGenerator.issue` uses the caller's tx instead of its own).
  No duplicates: the `SELECT ... FOR UPDATE` row lock on the scheme serialises concurrent creates per (company, purpose) across ALL instances (lock lives in Postgres), with the unique `(companyId, membershipNo)` index as backstop.
  No skipped numbers: any failure - including the in-tx clash guards for a sequence colliding with a legacy manual number, thrown as `httpError(409/400)` and mapped after rollback - rewinds the counter with the rollback, so the number is re-issued to the next create.
  Trade-off: the scheme row stays locked until commit, briefly queueing simultaneous creates in the same club - negligible at membership volumes and the standard gapless-numbering pattern.
  Manual-mode validation stays PRE-transaction (a rejection burns nothing by definition).
  Proven by test: 12 fully parallel issues -> distinct consecutive 1..12; an issue inside a rolled-back tx is re-issued next.
- `membership."Member"` - a person.
  ONE table, three kinds (`memberKind`):
  `individual` (THE member of an individual membership - **auto-created in the same transaction** as the membership, member number = membership number, status mirrors the contract),
  `nominee` (a corporate seat - created under a corporate membership, capped by the type's `noOfNominee`; `membershipTypeId` is a nominee-only OVERRIDE, NULL = the contract's type; `subscriptionBorneBy`),
  `dependent` (`dependentType` spouse|son|daughter|ward, `principalMemberId` -> its individual member OR nominee; only son/daughter/ward carry `expiryDate` - feeds §2.4 child expiry later).
  **Terminology standard (user decision 2026-08-20): the individual member or nominee that dependents belong to is THE PRINCIPAL** - "principal" (not "parent member") in every user-facing label, message, template header and doc, matching `principalMemberId`.
  The import's "Parent Member No" header was renamed to "Principal Member No" (old header kept as a parser alias).
  **Terminology standard (user decision 2026-08-20): user-facing text NEVER says "contract" - the front desk speaks "Membership No" / "Member No".**
  The dialog section is "Membership", the AR debtor split reads "Membership debtor / Nominee debtor", insight notes say "memberships per type" / "term expiries".
  "Contract" remains valid in INTERNAL docs/comments/identifiers describing the Membership-vs-Member domain split, and in the CONTROL PLANE where the subscriber's plan genuinely is a contract.
  Owns the person profile: `salutationCode`/`titleCode`/`nationalityCode`/`raceCode`/`industryTypeCode` (subscriber reference-data value refs), names (`firstName`/`middleName`/`lastName`, `nameOnCard`, `localName` native script), `gender`/`birthDate`/`identityNo`/`maritalStatus` (+`maritalDate`), contacts (phone/mobile/fax/email), employment (`employerName`/`designation`), `joinDate`, per-person `memberStatusId` (+ `statusDate` - the conversions-phase cascade rules depend on each person carrying their own status), nominee `creditLimit`, `photoUrl`, `userId` (the LIVE portal identity link, no FK), `remarks`, stamps.
  Unique `(companyId, memberNo)` across all kinds; nominee/dependent numbers derive from the principal's number plus a CLUB-CONFIGURED suffix (server-suggested, editable).
  **Child-number suffix rules (2026-08-21, `childNumbering.js`):** Club Specification stores one pattern per kind (`MembershipSetting.nomineeNoSuffix` / `dependentNoSuffix`, default `-A`) = one separator character (non-alphanumeric; `% _ \` excluded as LIKE hazards) + a form token `A` (letters) or `1|01|001|0001` (numeric, zero-padding is a MINIMUM width - 100 follows 099).
  Nominees suffix off the membership number, dependents off their principal's member number, so mixed styles compose (`CORP-0003.001-01`).
  Allocation: letters = first free A..Z (past 26 falls to a plain number); numeric = **strictly increasing** (max+1, a freed number is never reissued - user rule 2026-08-21).
  Pattern changes affect only FUTURE suggestions (numbers never rewrite; the scan keys on the configured separator, so old-pattern children never block a new series).
  The interactive suggest endpoint infers the kind server-side (corporate + principalNo == membershipNo -> nominee, else dependent); the import's derivation uses the same module.
  Screen: separator + style selects per kind on the Membership number card with a live first-numbers preview.
  Intra-service REAL FKs: `Member.membershipId` -> Membership (no cascade delete), `Member.principalMemberId` self-FK.
  Deliberately NOT stored: raw credit-card numbers (PCI - a payment token comes with payments work); signature waits for its own flow (`signatureUrl` later).
  **Member photo (2026-07-17):** `photoUrl` (500) holds the public URL of an image in the shared GCS bucket (per-env `ASSETS_BUCKET`, same as company/platform logos and golf-course photos).
  `POST /api/membership/memberships/photo` (multipart field `photo`, multer in-memory, 2 MB, images only) uploads and returns the URL; the member create/update then stores it via `normalizeMemberProfile` (http(s)-validated, so a stored value can never inject markup).
  Uploader lives in the shared person-profile form (all member kinds, create + edit); avatars render on the Members flat listing, the member tree dialog, and the portal home card (`/portal/me` ships `photoUrl`).

Status sync (individual class): changing the membership status updates the individual member's `memberStatusId` and vice versa, in one transaction.

### AR provisioning (`arProvisioning.js`)

The ONE place the membership side talks to AR about ledger accounts, through `platform/arGateway.js`:
- `onMembershipStatus(membership, status, tx, requestedBy)` / `onMemberStatus(member, membership, status, tx, requestedBy)` - when a contract or nominee reaches an ACTIVE-class status (create, status change, import migration), enqueue `DebtorProvisionRequested` with event-carried state (`debtorType`, `sourceId`, `sourceNo`, the display name, `terms`, `creditLimit`, `sendReminders`, `chargeInterest`, `requestedBy` for interactive saves only).
  Individual members never get their own account; dependents never do.
- `syncContractCreditLimit` / `syncNomineeCreditLimit` - enqueue `DebtorCreditLimitSyncRequested` when the limit changed (the ownership split above).
- `backfillCompanyDebtors(companyId)` - the `POST /debtor-backfill` utility for data that predates AR (no `requestedBy`, no bells).

### Contract expiry date (2026-07-18)

`Membership.expiryDate` (DATEONLY, NULL = lifetime/no expiry) - the per-contract end date term memberships need (`termMonths` on the type is only the template; renewals and mid-term migrations are contract facts).
Scope decision (user, 2026-07-19): the expiry date is strictly a TERM-membership fact.
Lifetime memberships never carry one in-system - fixed-horizon cases like KLGCC's "valid until 2087" are handled by the club OFF system and must never be a consideration in this software.
The dialog therefore shows the Expiry field only for term types (the edit-mode "record already carries a date" fallback is purely a data-integrity guard, not a lifetime-with-horizon feature).
Defaulting (user-chosen convention): on CREATE, when none is sent and the type `isTermMembership` with `termMonths`, the server sets join + termMonths **minus one day** - the term runs THROUGH the day before the anniversary - with month-end clamped (`defaultTermExpiry`; 2026-01-31 + 1 month -> 2026-02-27).
The dialog pre-fills the same value into an editable Expiry date field (recomputes when type/join changes, but never clobbers a staff-entered date; the frontend reads the type via the control's value, NOT the msValue() signal - a child control's valueChanges fires before the parent form's, so the signal is stale inside the handler).
Validation: expiry must be after join.
The listing card shows "Expires".
`Member.expiryDate` stays dependent-only (a different fact).
NOT yet built: nothing flips the status automatically - the future expiry/renewal cycle consumes this date (the Expired status now has its driver-to-be).

### Typed address book (2026-07-17 normalization)

`membership."Address"` replaced the four inline address blocks (member resident + mailing, membership company + mailing) and the `mailingSource` columns - the address shape was stamped out 4x across the two tables, the one genuine value-object duplication (a shared Profile table was considered and REJECTED: Membership describes the organization, Member the person; the column overlap was schema-level only, and contacts stay one-value-per-channel columns).

- Columns: id, companyId, the owner - exactly ONE of `membershipId` | `memberId` | `salesAgencyId` (real intra-service FKs, cascade with the owner; model-level exactly-one validation), `addressType` (`residential` | `mailing` | `company` | `other` - user vocabulary: "company", not "business"), `addressLine1` (required, 255) + `addressLine2` (optional, 255 - the app-wide two-line street standard, user decision 2026-11-11; the old single `address` column was renamed to line 1 by guarded boot DDL), `city`, `postcode`, `state`, `countryCode` (alpha2 value ref), RBAC stamps.
- Unique per (owner, addressType) via unique indexes per owner column (Postgres NULLS-distinct keeps them from colliding across owner kinds).
- **Mail resolution rule** (replaces mailingSource, no flag, no duplicated copy): mail goes to the `mailing` row when one exists, else falls back to `residential` (member) / `company` (contract).
  "Same as home" = simply no mailing row.
  AR's statement generation reads the same rule through `membershipGateway.lookupPartyBilling`.
- API: create/update endpoints accept an `addresses` array (contract book on the corporate membership body; person book on the member/profile body), validated by `normalizeAddresses` (one per type) and persisted wholesale by `replaceAddresses` inside the business tx; DTOs return `addresses` on the membership and each member (batch-loaded by `loadAddressBooks`).
- **Per-book vocabulary (2026-08-03):** the corporate CONTRACT book takes `company` + `mailing` only (`CONTRACT_ADDRESS_TYPE_KEYS` - Residential/Other describe people, not a company); person books keep all four.
  `/memberships/meta` ships `contractAddressTypes` alongside `addressTypes`; the web's contract type-select offers the narrow list plus the row's own legacy type (so a pre-existing Residential contract row - e.g. from an import - stays visible and correctable), and the Excel import now lands the corporate sheet's residential columns as the Company address.
- Web: one `#addressBook` ng-template (type select + address line 1/line 2/city/postcode/state/country + add/remove rows) bound to an `addresses` FormArray inside each form, replacing the repeated blocks in both dialogs.
- Migration `npm run migrate:addresses` (scripts/migrate-addresses.js): created the table, backfilled the old blocks (mailing rows only where `mailingSource='other'`), dropped the 18 replaced columns.
  Run 2026-07-17 before deploying.

### Welcome email on creation (2026-07-17)

Creating a membership queues a **welcome email** through the notification outbox (`enqueueEmail`, template `membership.welcome`, tenant-overridable; the outbox row type is `EmailQueued`) INSIDE the creation transaction - but only when no approval is needed (`approvalStatus === 'approved'`, which is always true today; a future approval workflow would create `pending` memberships, which skip this branch, so the approval transition MUST send it instead).
Recipient: individual class -> the member profile's email; corporate class -> the corporate contact email; no email on file -> silently skipped.
Variables passed: `memberName` (person name, or contact person / company name for corporate), `membershipNo`, `membershipTypeName` (the type's category label), `companyName` + `accountId` via the `getActiveCompany` seam (serviceContext), `joinDate`.
The enqueue is wrapped in try/catch (a template problem logs and never blocks the creation; safe because `renderEmail`'s reads run off-transaction).
Because the payload carries `companyId`, the mail goes out via the club's own SMTP when configured.

### Member Portal self-registration (2026-07-17)

The welcome email additionally carries a **portal registration link** - only for the individual class, where the recipient IS the member (a corporate contact is not a member; nominees get a per-member "Invite to portal" action later).
The link is `{FRONTEND_BASE_URL}/portal/register?token=...` with a **stateless signed RS256 token** (`memberPortal.controller.signRegistrationToken`: purpose `member-portal-register`, memberId + companyId, 30-day expiry - same pattern as workspace activation, so nothing extra is stored; a used link is inert because `Member.userId` is set).

Endpoints (`memberPortal.routes.js`, mounted at `/api/membership/portal` BEFORE the staff auth wall - a portal member has no workspace, so `requireModule`/`requireMenuAction` must not gate these; rate-limited and validated through `portal.schemas.js`):
- `GET /register/context?token=` (public) - who/where greeting data for the register page ({memberName, memberNo, email, companyName, alreadyRegistered}).
- `POST /register` (public; body {token, password}) - provisions the platform User via the **`identityGateway` seam** (`platform/identityGateway.js`; Identity owns the User table, so membership never touches the model): no user with the member's email -> create verified local user + a 24h auto-login token (`identityGateway.issueLoginToken`); user already exists -> link `Member.userId` WITHOUT touching that account's password (`linked: true`; same trust basis as password reset - control of the mailbox) and route them to normal login.
- `GET /me` (`verifyToken` only) - every Member row linked to the caller's userId (one person can hold memberships at several clubs), shaped as portal cards (member no/name/kind, club name via `getCompanyProfile` seam, membership no, type, status name+colour, join date, `photoUrl`).

Web (both routes OUTSIDE the dashboard shell, lazy):
- `/portal/register` - public set-password page (greeting card, password + confirm, already-registered and linked-to-existing-account states).
- `/portal` (authGuard) - the minimal Member Portal home: membership card(s) + coming-soon tiles (golf/facility/dining booking, profile, requests) that future member-facing endpoints will light up.

Gotcha: the `membership.welcome` platform template row was already seeded before the link block existed; seeding never overwrites, so shipping this required a one-off `resetPlatformDefault('membership.welcome')` (any subscriber override created before it would need its own reset).

API (behind `verifyToken` + `requireModule('MEMBERSHIP')`):
- `/api/membership/memberships` (+ `requireMenuAction('/membership/memberships')`): `GET /meta` (vocabularies + numbering mode), `GET /options` (type/status/fee/agent pickers in one call - avoids cross-menu RBAC on the other masters' endpoints), `GET /?q=&class=&status=&limit=&offset=` (SERVER-SIDE search + pagination, 2026-07-17 - slim list rows + aggregate total/class counts, `q` matches membership no / corporate name / individual member name via an EXISTS probe; default page 50, max 200; RBAC row flags computed per page), `POST /` (create; individual requires a nested `member` profile), `GET /:id` (detail + member tree - the Edit/Members dialogs fetch this since the list rows are slim), `PUT /:id` (contract edit; number/class/type immutable), `GET /:id/ar-credit`, `GET /:id/members/suggest-no`, `POST /:id/members` (nominee, seat-capped), `POST /:id/members/:memberId/dependents`, `PUT /:id/members/:memberId`.
- `/api/membership/members` (+ `requireMenuAction('/membership/members')`): `GET /meta`, `GET /?q=&kind=&status=&offset=` - flat read-only server-side search across every person (member no / name / IC / email), paged 200 at a time ("Load more").
- Scale: both listings are paginated + server-filtered so a club with tens of thousands of members never ships more than one page to the browser; fuzzy `%q%` search is backed by **pg_trgm GIN indexes** (`*_trgm` on Membership.membershipNo/corporateName and Member.memberNo/firstName/lastName/identityNo/email - created by manual migration, deliberately NOT in the Sequelize models).

Web: `/membership/memberships` (list with class filter chips + coloured status dot; class-aware create/edit dialog - the picked type drives individual-vs-corporate sections and defaults; a Members dialog manages the people tree with New nominee / Add dependent / Edit) and `/membership/members` (flat search screen, server-side debounced).
Both need DB Menus under the Membership module (routes `/membership/memberships`, `/membership/members`) + role grants.

Still to build in the CRM: per-member standing-charge overrides (additional/exception), hobbies / misc attributes / article subscriptions as their §2.1 masters get built; and the conversions phase - ID conversion, category conversion, status conversion (immediate + scheduled plan), membership transfer - each with follow-the-principal cascades, which needs the §2.1.1 default-status columns on Club Specification.
Cascade vocabulary decision pending user confirmation: cascades follow `actionControl != 'barred'` (the generalisation of legacy Authorized/Warning-follow, Unauthorized-skip; updated for the 2026-08-09 control split).

## Built: Billing schedules (fee runs, 2026-08-06)

Membership is a PRODUCER into AR: staged runs that post one invoice per member charge through `arGateway.postCharge` (`sourceModule 'membership'`), gated on the AR Specification's `membershipIntegration` switch.

- `membership."BillingSchedule"` - the run header: `companyId`, `billingType` (`membership-fee` | `subscription-fee`), `periodMonth` (first-of-month key), `docDate` (the document date the posted invoices carry), `trxDate` (accounting-period date, defaults to `docDate`), `totalAmount` (NET sum of non-skipped items), `itemCount`, `status` (`pending` | `partially-posted` | `posted` | `cancelled`; a partial unique keeps one non-cancelled run per company, type and month), stamps.
- `membership."BillingScheduleItem"` - one row per charge, a permanent audit row: `billingScheduleId`, `membershipId`, `memberId`, `incurredByMemberId` (the person whose charge it is), `debtorTarget` (`membership` or `member` - the one-debtor routing), `transactionTypeId` (the AR catalog entry), `description`, `amount`, `status` (`pending` | `posted` | `skipped` | `failed`), `postedLedgerId` + `postedDocNo` (the AR invoice), `issue` (why a post failed), stamps.
- Flow: `POST /billing-schedules` refuses early unless `arGateway.isMembershipIntegrationEnabled`, then generates the staged NET items for a month (membership fees from the fee master's installment stages; subscription fees from the type's standing charges by the member's status and frequency, routed to the contract debtor or, for a nominee whose subscription is not borne by the company, the nominee's own account); the review unticks items (`PATCH /billing-schedule-items/:id` toggles `pending` <-> `skipped`); `POST /billing-schedules/:id/post` posts the selected pending items one by one - each item is tax-quoted at posting through `taxGateway.quoteTax` on the transaction type's scheme at the run's `docDate`, then handed to `arGateway.postCharge` with the quote (its own AR transaction; a refusal marks the item `failed` with the reason in `issue`, never rolls back the others; the header becomes `partially-posted` or `posted`); `POST /billing-schedules/:id/cancel` cancels a run with no posted items.
  Billing runs deliberately do NOT check `chargeControl` or the credit limit (`enforceCredit: false`) - billing reality is never blocked.
- Gate: `requireMenuAction('/membership/billing')` - typically granted to Finance (cross-module RBAC).
- Business Insights' "Expired" movement and the future renewal cycle will consume the same tables.

### Open questions (resolve per file as requirements arrive)
- Whether Membership Fee is a simple lookup or a richer pricing rule (proration, currency) - may outgrow a plain master file.
- Default seed sets per file, and whether any are locale-dependent (Salutation, Race).

## Built: Guest Registration and the day pass (2026-11-10)

A member's guest is registered at the front desk for a date and receives a digital day pass.
It gives guest control to clubs with no Golf or Facility subscription (a social club with a few outlets), and one pass that every module can check.
Structures approved by the user on 2026-11-10; vocabulary: "Guest Registration".

### Tables

`membership."Guest"` (model `Guest`) - the guest person, one row per person per company.

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | UUID | no | uuid v4 | Primary key. |
| `companyId` | UUID | no | | |
| `name` | STRING | no | | Mandatory. |
| `mobile` | STRING(30) | yes | | Dialling code + number (the phone-input standard). |
| `email` | STRING | yes | | Stored lower-case. |
| `identityNo` | STRING(50) | yes | | IC or passport, optional. |
| `remarks` | STRING | yes | | |
| `createdBy`, `createdByDepartmentId`, `updatedBy` | UUID | yes | | Ownership stamps. |

Mobile OR email is mandatory (the pass must reach the guest) - enforced by `normalizeGuest`, not by the table.
Indexes `(companyId, mobile)` and `(companyId, email)`, neither unique: a family may share one email address.

`membership."GuestRegistration"` (model `GuestRegistration`) - one guest, one host member, one date = one day pass.

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | UUID | no | uuid v4 | Primary key. |
| `companyId` | UUID | no | | |
| `registrationNo` | STRING(50) | no | | From the `membership-guest` series ("Guest Registration No."). |
| `guestId` | UUID | no | | FK to `Guest` (intra-service, no cascade). |
| `memberId` | UUID | no | | FK to the host `Member` (intra-service, no cascade). |
| `visitDate` | DATEONLY | no | | The pass is valid on this date only (club clock). |
| `status` | STRING(20) | no | 'registered' | `registered` / `arrived` / `cancelled`. |
| `channel` | STRING(20) | no | 'desk' | `desk` now; `portal`, `facility`, `golf` later. |
| `passToken` | STRING(64) | no | | 32 random bytes as hex - the key behind the pass link and its QR code. |
| `passSentAt`, `passSentVia`, `passSentTo` | DATE, STRING(20), STRING | yes | | The last send: `email` or `whatsapp`, and the address or number. |
| `arrivedAt`, `arrivedBy` | DATE, UUID | yes | | The desk marks the arrival. |
| `cancelledAt`, `cancelReason` | DATE, STRING | yes | | |
| `remarks` | STRING | yes | | |
| `createdBy`, `createdByDepartmentId`, `updatedBy` | UUID | yes | | Ownership stamps. |

Unique `(companyId, registrationNo)`, unique `passToken`, and a partial unique `(companyId, memberId, guestId, visitDate) WHERE status <> 'cancelled'` - one live registration (one pass) per guest per host per day.
"Expired" is never stored: `passStateOf(status, visitDate, today)` derives `valid` / `upcoming` / `expired` / `cancelled` from the club's own date.

`membership."GuestVisit"` (the ledger, 2026-10-25) gains `guestId` (UUID, nullable, index `(companyId, guestId, visitDate)`), and `sourceModule` gains `membership` (`sourceRef` = the GuestRegistration id).

### The counting rule

A KNOWN guest (a ledger line carrying `guestId`) counts ONCE per host per day, however many lines the modules write for them: registered at the desk, then on a court booking, then on a flight is one visit.
A line without a guest record (today's facility lines, which carry only a name) counts its own `guestCount`, as before.
The rule lives in ONE pure function, `countVisits` in `guestVisit.service.js`, used by `usedInMonth` (the allowance) and by the enquiry's groups; `alreadyCounted` tells a producer that a further line for the guest draws nothing more.
`recordGuestVisit` in `platform/membershipGateway.js` accepts an optional `guestId`, so a producer that knows the guest joins the rule without any other change.
The pass itself is read across the seam too (2026-11-12, for Facility's Control Station): `findGuestPass(companyId, code)` takes the scanned pass link or the bare token and answers the pass facts (the registration number, the visit date, the state by the club clock, the guest's id and name, the host's member id, number and name) or null for a code that is no pass of that club; `getGuestPass(companyId, id)` answers the same by id; `markGuestArrived(companyId, id, { actorId })` marks a valid, not yet arrived pass as arrived and is safe to call again.
A producer may also REGISTER a guest who stands at its counter with the member (2026-11-12, Facility's station, slice 6c): `registerGuestAtDoor(req, { memberId, visitDate, guest: { name, mobile, email }, channel }, { transaction })` applies the Guest Registration rules (the returning guest is the same name with the same mobile or email; a pass that guest already holds with that host for the date is returned as it is; an exhausted monthly allowance refuses) and creates the registration already arrived on the visit date, on the producer's channel.
It answers the pass facts with `created`, `counted` and `share` (the pass link, its QR code, the WhatsApp link and whether it can be emailed), or `{ nameOnly, warning }` when the club has no automatic Guest Registration No. series, so the door is never refused for that.
`cancelGuestAtDoor(companyId, id, { channel, actorId, reason })` cancels ONLY a registration that channel created and voids its visit; `getGuestPassShare(req, id)` and `sendGuestPass(req, id, via)` hand the pass over again from the producer's screen.
The pass facts carry the registration's `channel`.
`listGuestPassesOfHost(companyId, memberId, date)` answers the live passes of one host for a date (the id, the number, the status, the channel, the guest), so a counter can list the guests it may be serving under that member (2026-11-13).
A producer serves a guest on the pass through these three and never reads `GuestRegistration` itself.

### Registration rules (`guestRegistration.service.js`)

- The host is keyed by member number and resolved through `getGolfMemberStanding`: status Action control `barred` refuses, `warning` warns (in the drawer and in the save message).
- The visit date is today or later by the club clock (`companyTimezoneById`).
- The guest: the one picked from the returning-guest search (details corrected from the form), else an exact returning match (same name and the same mobile or email), else a new `Guest`.
- An exhausted monthly allowance refuses, the same rule as the Facility desk; a guest this host already has on the ledger that day draws nothing more, so they are never refused for the allowance.
- The host's Member row is locked for the transaction, so two desks cannot both take the last visit.
- The number is issued inside the transaction (`membership-guest`; a manual series takes the keyed number; no series refuses with a pointer to Numbering Control).
- Cancel needs a reason, voids the ledger line and stops the pass; an arrived registration cannot be cancelled.
- Arrive works on the visit date only.
- Edit corrects the guest's details and the remarks only: the host and the date ARE the registration (cancel and register again).

### The pass

- A public page, `/guest-pass/:token` in the web app, outside the shell and with no login: the club's name and logo, the guest, "Guest of" the host's name, the date, the registration number, the QR code and the LIVE state read from the API on every open, so an old screenshot never passes for a valid pass.
  It shows no contact details and no member number, and the QR code is drawn only while the pass can still be used.
- Email: template `membership.guest.pass` (tenant-overridable), queued in the registration's transaction when the desk ticks "Email the pass", or later from the pass view.
- WhatsApp: the platform has no WhatsApp integration, so the pass view offers a `wa.me` click-to-chat link (`whatsappLink`) that opens the desk user's own WhatsApp with the message prefilled; `PUT /:id/send` with `via: 'whatsapp'` only records that it was shared.
  Automatic sending needs a WhatsApp Business provider and is a later decision.
- Verification: the desk marks the arrival from the row, or scans the pass (`PUT /scan` accepts the pass link or the bare token; the shared `<app-qr-scanner>` or a handheld scanner typing into the field).

### Web

- Since 2026-11-14 the screen below is the Registration Counter (`/membership/registration-counter`, component `membership-registration-counter`); what follows describes its member's-guest side, and "Built: Registration Counter" the rest.
- `/membership/guest-registrations` (`membership-guest-registrations`): listing with the date range and status filters, the "Scan pass" button, one chip per row read from the status and the pass date (Expected today / Registered / Arrived / Did not arrive / Cancelled), "Mark arrived" as the visible action on the day and "Pass" otherwise.
  ONE `<app-dialog>` with four views (form, pass, scan, cancel) per the single-dialog standard: registering moves the same dialog from the form to the pass view.
- `/membership/guest-visits` (`membership-guest-visits`): the read-only enquiry, grouped by host member or by guest, each card opening to its ledger lines.
- `/guest-pass/:token` (`guest-pass`): the public pass on the shared auth card.
- Club setup after deploy: the two menus (`/membership/guest-registrations`, `/membership/guest-visits`) and a "Guest Registration No." series under Membership Numbering Control.
  Since 2026-11-14 the first menu's route is `/membership/registration-counter` (the old route keeps working until the row is changed), and the same series numbers every day pass.

### Not built yet

- A guest fee per visit charged to the host's account.
- Guest registration by the member in the Member Portal.
- Passes for the guest lines of Facility bookings and Golf flights (they need the guest's identity on the line, then `recordGuestVisit` with `guestId` and a `GuestRegistration` on channel `facility` / `golf`).
  Golf IS a producer of the ledger since 2026-11-14 (`sourceModule` 'golf', `sourceRef` = the starting-nine `golf.Player` id; a guest line may name one of the host's existing passes, which carries `guestId` and marks the pass arrived at registration - see golf-management.md, MONTHLY GUEST ALLOWANCE); creating a pass from a golf line is still deferred.
  The gateway gained `guestAlreadyCounted(companyId, memberId, guestId, date)` for a producer counting the visits a save needs.
- A cap on how often the same guest may visit.

## Built: Registration Counter (2026-11-14)

The club's ONE control counter for everyone who is not a member.
A member's guest, and a visiting member of an affiliated or reciprocal club, both leave it with the same thing: a day pass (QR code) that the golf desk, the Facility station and the outlets scan.
Raised in the Facility Management session (a visiting member must not present the letter at a station) and decided with the user on 2026-11-14; structures approved the same day.
It replaces the Guest Registration screen, which becomes one side of the counter; Affiliated Visits stays the Membership office's letter file.

### User decisions (2026-11-14)

- The QR code is ALWAYS a daily pass.
- A letter of introduction may cover several days, and the visitor stops at the counter on EACH day they come ("counter every day").
- Each such day counts as one visit against the club's limits ("count each day").
- What the visitor uses differs by day (golf on the first, a facility on the second, both on the third), so golf hangs off the letter one flight per play day.
- A walk-up with no letter on file is recorded and received on the spot only where the arrangement needs no approval; where it does, the request is recorded and submitted and no pass is issued until it is approved.
- The guests a visiting member brings get a pass each, up to the club's guests per visit.
- A plain Visitor (no member, no club) is not registered at the counter yet; a dining-only visitor waits for POS and for the club's policy on who may enter.
- The screen and the menu are named "Registration Counter".

### Structures

`membership.AffiliatedVisit` gains one column.

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `visitDateTo` | DATEONLY | yes | The letter's last day when it covers several; NULL = a one-day letter. |

`bookingProfileId` on the same table is LEGACY and unused: boot copies it into the flights table below (guarded, idempotent) and nothing writes it any more.
`facilities.golf` (JSONB) gains `playDate`, the day of the letter the requested flight is played (default: its first day).

`membership.AffiliatedVisitFlight` (new) - the golf flight a letter holds for one of its days.

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | UUID | no | Key. |
| `companyId` | UUID | no | Value ref. |
| `affiliatedVisitId` | UUID | no | The letter (FK inside the service). |
| `playDate` | DATEONLY | no | A day of the letter. |
| `bookingProfileId` | UUID | no | The golf flight booking (value ref), unique. |
| `createdBy`, `createdByDepartmentId`, `updatedBy` | UUID | yes | Ownership stamps. |

`membership.GuestRegistration` is widened to every patron group; the table keeps its name.

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `patronGroup` | STRING(20) | no | New, default `guest`; `guest` / `affiliate` / `reciprocal` (`guestRegistration.constants`). |
| `memberId` | UUID | yes | Was required; the host member, a member's guest only. |
| `guestId` | UUID | yes | Was required; NULL on the row of the visitor a letter names, set on a guest that visitor brought. |
| `affiliatedVisitId` | UUID | yes | New; the letter the pass was issued on (FK inside the service). |
| `affiliatedClubId` | UUID | yes | New; the home club (value ref). |

Two partial unique indexes guard the day: one live pass per letter per date for the visitor (`UX_GuestRegistration_Live_Visit_Date`), and one per guest of that visitor (`UX_GuestRegistration_Live_Visit_Guest_Date`).
The alter-sync never relaxes NOT NULL, so `app.js` drops it on `memberId` and `guestId` in a guarded boot step outside the fingerprint gate.
One registration row is one day at the club: for a visiting member it is the day that counts.

### The letter over several days (`affiliatedVisit.service.js`)

- `normalize` reads `visitDateTo` (not before the first day, at most 31 days, the agreement must cover the last day) and refuses an alternate date on a several-day letter.
- The limits count DAYS: `countedDays(visit, attended, today)` (pure, unit-tested) answers the days of one letter that count.
  An outbound letter counts every day.
  An inbound letter not yet received counts the days still to come, so the office cannot over-promise; a day that passed without the visitor is given back.
  A received letter counts the days attended plus the days still to come; a completed one the days attended.
  A letter received before the counter existed has no attended day on record and counts its arrival day.
- `capBreach` (pure, unit-tested) adds the new letter's days to the counted days of the other letters in each calendar period the letter touches, for the per-member cap and the club-wide annual quota.
- Flights: `POST /:id/flights/preview` shows the flight a further day would book, `POST /:id/flights` books it through the same golf seam call the confirmation uses, `POST /:id/flights/:flightId/remove` cancels one day's flight (golf refuses while a player of it is registered).
  Cancelling the letter cancels every flight.
- The golf desk's questions, all asked through `platform/membershipGateway.js`:
  `registrationGate` lets a flight's players register only once the visitor has registered at the counter for that play date;
  `byBooking` answers the standing for THAT flight's day (`confirmed` until then, `arrived` after), with the letter's own status as `letterStatus`, so the tee sheet offers the arrival check on each day of a longer letter;
  `completeIfSettled` completes the letter only when its last day has come and no flight still owes a bill (`golfGateway.bookingUnsettledCount`).
- The worker tick (`scanVisits`) expires an unreceived letter after its LAST day and completes a received one after it, once no flight owes a bill.

### The counter (`registrationCounter.service.js`)

- `list` answers the registrations of the period (every patron group, `group` filter) plus `expectedVisits` (the confirmed or running inbound letters valid today whose visitor has not registered yet today) and `clubs` (where a walk-up may come from, with `needsApproval`).
- `receiveVisit(req, visitId, { letterSighted, idSighted }, { channel })` registers the visitor for TODAY and issues the pass.
  The first time both ticks are required and the letter turns `arrived`; on a later day of the same letter the ID alone.
  Receiving twice on one day answers the pass already issued; the letter row is locked so two desks cannot both issue it.
  A one-day letter may also be received on its alternate date (`receivableOn`, pure, unit-tested).
  The golf desk's own "Receive" on the tee sheet reaches the same function through the seam (`receiveAffiliatedVisit`, channel `golf`), so there is one rule and the day pass is issued either way.
- `walkUp` keys the letter (no golf), confirms it and receives the visitor in one go; where the club or its player type needs approval it stops after submitting and answers `issued: false`.
- `addVisitorGuest` issues a pass to a guest the visitor brought, on the visitor's own registration of today, inside the club's `maxGuestsPerVisit`; the guest is a `membership.Guest` like any other and no member's allowance is drawn.
- `guestRegistration.service.js` reads every row through one `party` (person, host member, letter, home club, accompanying), so the listing, the pass, the email and the seam ask one question.
  A visiting member keeps the name of the letter on edit (only contact details and remarks change, written to the letter) and needs no contact detail.
  Cancelling a visitor's day follows the DATE, not the status (these rows are born arrived): a day that has passed stands; the visitor's own day takes that day's guests with it, and a letter left with no day attended goes back to `confirmed`.
- The pass page and the seam's pass facts carry `patronGroup`, and `host` is NULL on an affiliated or reciprocal pass, which carries `club`, `visit` and `accompanying` instead.
  The Facility station refuses such a pass with a clear message until its own rules for these holders are built (`stationRules.passVerdict`).
- Email: `membership.visitor.pass` (the day pass of a visiting member or of a guest they brought); a member's guest keeps `membership.guest.pass`.

### API

Mounted at `/api/membership/guest-registrations` behind `requireAnyMenuAction(['/membership/registration-counter', '/membership/guest-registrations'])`, so a Menu row that still carries the old route keeps working until it is changed.
New routes: `POST /visits/:id/receive`, `POST /walk-ups`, `POST /:id/guests` (each issues a NEW pass and needs the Create grant); `GET /` takes `group`.

### Web

- `/membership/registration-counter` (`membership-registration-counter`, the renamed Guest Registrations component; the old path opens the same screen).
  "Visiting members expected today" sits above the registrations with a Receive action; "New registration" asks who is at the counter (the global `.dlg-pick` rows: a member's guest, or a visiting member), then lists today's letters with a walk-up entry.
  ONE `<app-dialog>` with a mode signal (pick / visit / form / receive / walkup / pass / scan / cancel); issuing a pass moves the same dialog on to the pass view.
  A visitor's row of today offers "Register their guest" in its kebab.
- `/membership/affiliated-visits`: "Last day" on the letter, the play date of the requested flight, the days at the counter on the card, and "Golf flights" (a centred dialog: the bookings of the letter, and add a flight with a check-then-book step).
- `/guest-pass/:token`: the title reads "Day pass" and the chip "Member of <home club>" for a visiting member.

### Verified

API unit tests 309 and web unit tests 420 pass; the production build is clean.
A service-level smoke against the local dev database passed 40 checks (a 3-day letter, the first-day ticks, the pass, the golf gate by day, the visitor's guest and its limit, the public pass, the seam facts and the station refusal, the day-counted limit, cancel and re-receive, a walk-up) and removed its rows.
Not yet exercised: the screens in a browser against a deployed API, a real golf flight on a second day, and a walk-up that routes through an approval chain.

### Not built yet

- The Facility station serving an affiliated or reciprocal pass (the item's own answer for these holders, entering a facility on the pass, the entry fee, charge to home club, completion held while an item is out or a facility bill is open): the Facility Management session.
- A plain Visitor at the counter.
- The user manuals of the Registration Counter and the changed Affiliated Visits screen.


## Built: Business Insights (analytics, 2026-07-22)

Two read-only analytics screens over the membership base, user-grouped under a "Business Insights" menu group (chosen over Power BI embedding: native charts inherit RBAC/i18n/theming and avoid the Azure/Fabric capacity cost).
Split into two screens deliberately: lighter page load, and per-screen RBAC so agent/commission analytics can be granted separately from membership demographics.

- `/membership/membership-analysis` - KPI row (total/active/new joins/expired/net/people), monthly movement chart (joins vs contractual expiries), status donut (membership OR member status, coloured by `MembershipStatus.statusColor`), and type / age-band / residential-country / nationality bars.
- `/membership/agent-performance` - channel KPI row, monthly closings stacked by channel (internal | external | agency | unattributed), and a channel -> agent leaderboard.

API base `/api/membership/dashboard` (`dashboard.controller.js` + `dashboard.routes.js`, validated through `dashboard.schemas.js`): `meta`, `summary`, `movement`, `breakdown?dimension=`, `agents`, `drill`.
No new tables - live company-scoped `GROUP BY` over the CRM base.
RBAC is per endpoint: summary/movement/breakdown require the membership-analysis menu, agents requires agent-performance, and meta + drill pass with EITHER grant via the `requireAnyMenuAction(routes[])` seam in `platform/serviceContext.js`.

Semantics decided with the user:
- "Expired" movement counts `Membership.expiryDate` in the period (contractual - nothing flips status automatically yet), not status changes.
- The Active KPI counts status classes `active` + `active-absent`.
- People dimensions count ALL member kinds, with a member-kind filter; country is the residential `Address.countryCode`, UPPER-normalised (stored case varies).
- Agent performance groups the CLOSING `salesAgentId` (fixed at joining, the commission driver) into the three-tier channel view; `agencyName` is the SalesAgency name column (not `name`), and the type display column is `category`.

Every number drills: `drill` returns the records behind any segment with COMBINABLE filters (status/type/agent/agency/kind/age band/country/nationality/join- and expiry-ranges), paged, as memberships or members.
The web drill panel (`app/membership-insights/insight-drill.ts`) shows removable cross-filter chips and is shared by both screens; charts are ECharts (lazy chunk) via the shared `dash-chart.ts` wrapper with a light/dark palette in `insight-theme.ts`.
