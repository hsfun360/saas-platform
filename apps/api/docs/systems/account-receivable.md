# Account Receivable (AR)

The open-item debtor ledger for the whole platform.
Every product (Membership, Golf, Facility, POS) is a producer that posts resolved charges into AR; AR owns balances, credit control, receipts/allocation, statements and late-payment interest.
That producer/ledger boundary is why AR is its own service and not part of Membership.

- **Module folder:** `src/modules/ar`
- **Gateway base:** `/api/ar`
- **Schema:** `ar` (registered in `platform/schemas.js`)
- **Seams:**
  - `platform/arGateway.js` - producers -> AR.
    Nine exports: `enqueueDebtorProvisioning` and `enqueueCreditLimitSync` (outbox events `DebtorProvisionRequested` / `DebtorCreditLimitSyncRequested`, fire-and-forget), `getCreditStanding` (read), `authorizeCharge` (advisory precheck), `postCharge` (SYNCHRONOUS in-process invoice posting inside AR's own transaction; returns `{ id, docNo }` or `{ error }`), `getDocumentStanding` (read: gross / outstanding / paid + settlements), `listTransactionTypes`, `getTransactionType`, `isMembershipIntegrationEnabled`.
  - `platform/membershipGateway.js` - AR -> Membership party-master READS (display names, listing search, billing addresses, statement classification, the incurred-by person list).
    AR never requires membership models directly.
  - `platform/taxGateway.js` (`quoteTax` at save), `platform/dimensionGateway.js` (analysis pickers + validation, module code `'AR'`), `platform/numberingGateway.js` (the `ar-*` series), `platform/workflowGateway.js` (approval chains), `platform/notificationGateway.js` (run completion bells + emails).
- **Entitlement:** `requireModule('AR')` - the frozen `Module.code`, never the display name "Account Receivable".
- **Request validation:** every route that reads a request part mounts `validate()` with a schema from one of four files beside the controllers - `arDocument.schemas.js` (the document doors), `debtor.schemas.js` (listing, maintenance, Other Debtors, reconcile), `transactionType.schemas.js` and `arPeriodic.schemas.js` (interest, settings, statement runs and statements); the exchange-rate routes validate inside their own controller.
  The 9 health, meta, list and preview reads that take no request part stay bare.

## Vocabularies (`ar.constants.js` and the models)

- Debtor types: `membership` ("Membership") | `member` ("Nominee") | `other` ("Other Debtor").
- Debtor statuses: `active` | `suspended` (blocks new postings, account stays visible) | `closed` (terminal).
- Transaction classes: `invoice` | `debit-note` | `credit-note` | `interest` | `deposit` | `receipt` | `refund` | `forex`; `PAYMENT_TRX_CLASSES` = `receipt`, `refund`.
- Ledger document statuses: `draft` | `pending-approval` | `open` | `settled` | `void` (open/settled = posted); receipts, refunds and deposits share the vocabulary, deposits additionally `closed`.
- Interest run statuses: `pending` | `confirmed` | `cancelled`.
- Statement statuses: `generated` | `sent` | `void`; statement RUN statuses: `queued` | `running` | `cancelling` | `completed` | `cancelled` | `failed`.
- Numbering purposes (`ar.NumberingScheme`, screen `/ar/numbering`): `ar-invoice`, `ar-debit-note`, `ar-credit-note`, `ar-interest`, `ar-deposit`, `ar-receipt`, `ar-refund`, `ar-statement`, `ar-other-debtor`.
- Source modules on a ledger row: `membership` | `golf` | `pos` | `facility` | `ar`.

## Design decisions (approved 2026-08-04/05)

The full agreed design (Debtor shape, charge routing by category, credit checking, open-item ledger with Invoice/DN/CN + Official Receipt/Refund + Deposit, allocation matrix, interest generation, statements) is recorded in the project memory `ar-debtor-design` and in the conversation of 2026-08-05.
Key rules a maintainer must not break:

- Debtor is THIN: `(companyId, debtorType 'membership'|'member'|'other', sourceId)` + credit terms/prefs.
  Party data stays with the party master; documents snapshot it at generation time.
  The pointer NEVER lives on the membership side.
- **Terminology standard (user decision 2026-08-20): the 'member' debtor type reads "Nominee" everywhere users see it** (listing filter/chips, billing detail "Membership debtor / Nominee debtor") - a member-type ledger account only ever belongs to a nominee, since individual members share the membership debtor and dependents never get one.
  The stored key stays 'member'; "personal" survives only in the per-person credit-cap wording ("Personal credit limit exceeded"), which is a different concept.
- The ONE deliberate exception to thin: `debtorAccount` + `name` (approved 2026-08-11) are SORT-KEY SNAPSHOTS of the party's number/display name, so the paged listing can `ORDER BY` them (live display data resolves through the seam AFTER the page query and cannot be ordered on).
  The listing still displays live-resolved values - a stale snapshot can only mis-order, never mis-display.
  Freshness: stamped from the provisioning payload (event-carried state; replays fill NULLs but never overwrite), refreshed same-tx on Other Debtor saves, read-repaired by the listing when a page's live value differs, and verified by reconciliation (missing = stamped every run; drift = reported, repaired in fix mode; unresolvable party = reported).
  NOT NULL since 2026-08-11 (backfill verified zero NULLs first): a ledger account can never exist without number + name; a provisioning payload without them fails and retries via the outbox.
- `ar.Debtor` also carries the AR-owned account facts: `currencyCode` (the ACCOUNT currency, see multi-currency), `terms` (repayment days driving Invoice/DN `dueDate`; NULL = due immediately), `sendReminders` and `chargeInterest` (seeded from the Membership credit card at provisioning, maintained HERE afterwards - the interest run only considers debtors with `chargeInterest` on), `status`, stamps (`createdBy` NULL = system-provisioned).
- `ar.OtherDebtor` is the AR-owned city-ledger party master: `code` (unique per company; issued by Numbering Control purpose `ar-other-debtor` in auto mode or keyed in), `name`, `registrationNo`, `taxNo`, `contactPerson`, phone/mobile/fax/email, one inline address block (`address1..3`, `city`, `state`, `postcode`, `countryCode`), `currencyCode`, `remarks`, `isActive`, stamps.
  Creating one creates the ledger account in the same transaction.
- Hot balances live in `CreditAccount` (pool) and `CreditMemberLimit` (per-person caps, row = capped person only), materialized in the same tx as every posting, pool row locked first.
- After first provisioning, AR owns repayment terms / reminders / interest - EXCEPT the credit limit of membership/nominee accounts.
  **Credit-limit ownership split (user decision 2026-09-27, superseding the 2026-08-05 "Finance sets it manually" rule for member accounts):** the Membership department maintains member-account limits on the membership/member record, and a changed limit syncs into `CreditAccount.creditLimit` via the `DebtorCreditLimitSyncRequested` outbox event (the worker calls `debtorProvisioning.service.syncCreditLimit`; no ledger account yet = silent no-op; provisioning seeds the value instead).
  Finance maintains ONLY Other Debtor limits on the AR Debtor screen - `PATCH /debtors/:id` rejects a credit-limit edit for membership/member accounts, and the Edit-terms dialog shows the field read-only with a "maintained in Membership" hint.
  The membership dialogs show the live pool (limit + outstanding) beside the credit-limit field via `arGateway.getCreditStanding`.
- Dependents never get debtor rows; their charges resolve to the principal at posting time.
- `Ledger.incurredByMemberId` is the PERSON whose consumption a document records (a nominee, a dependent, the individual member), stamped ONLY by producers at posting (fee runs, golf settlement, no-show charges pass the member through `membershipGateway.getChargeTarget`); there is no manual picker since 2026-08-20.
  NULL on an other-debtor entity's own charges.
  Statements itemize by it and personal credit caps count by it; resolution happened once at posting and is immutable.
- Every document table (Ledger, Receipt, Deposit) carries BOTH `docDate` and `trxDate`.
  `docDate` is the actual occurrence date - it drives aging and `dueDate` and prints on the document.
  `trxDate` is the accounting-period (GL) date - defaults to `docDate`, but a forgotten last-month document keyed after the period closed keeps last month's `docDate` with a current-month `trxDate`.
  Aging/statements bucket by `docDate`/`dueDate`; financial-period reporting buckets by `trxDate`.

## Financial-analysis dimensions (hybrid design 2026-08-25; catalog owned by the shared Dimension capability)

The catalog (`dimension.DimensionCategory` + `dimension.DimensionOption`, `dimensionNo` 1..6 assignment, repurpose lock) is OWNED by the shared Dimension service - see [dimension.md](dimension.md); AR consumes it through `platform/dimensionGateway.js`, never the models, passing the module code `'AR'`.
AR's side:

- `ar.Ledger.analysis1Id..analysis6Id`: the analysis columns (option ids), each with a **partial index** `(analysisNId, trxDate) WHERE NOT NULL` - only tagged rows are indexed, so the sparse NULL majority costs nothing and reports stay `GROUP BY` one column with no junction pivot.
  An option id implies its company + category, so no companyId prefix is needed.
- Doors: manual drafts + the DN door validate `body.analysis` (`{ "<dimensionNo>": optionId }`) through `dimensionGateway.readSelections` (dimension assigned + active, option of that category + active, required enforced - system producers exempt) and stamp the columns; void reversals COPY the original's columns so per-dimension reports net the pair; `postLedgerDoc` accepts `analysisColumns` for future producers.
  Account meta ships `analysis` (from `dimensionGateway.entryMeta`) - the entry dialog renders one picker per number-assigned dimension, labelled with the company's names; listings ship the ids for draft-edit prefill.
- AR registers the Dimension usage check in `src/wiring/dimensionUsage.js` (any `analysis<N>Id` referencing the category's options = dimension number locked).
- Screens: `/ar/analysis` "Analysis Setup" master-detail (dimensions left with Dimension-number/required/count chips, selected dimension's options right; URL-driven selection; drawer dialogs; enable/disable in kebabs) - a thin client of `/api/dimension`.
  USER MUST ADD MENU '/ar/analysis' (icon `category`).
- Receipts/Deposits carry no dimensions yet; a per-dimension revenue report screen is a future consumer of the partial indexes.

## Tax breakdown - `ar.TaxLedger` (2026-08-24)

One row per rate component of the scheme behind a Ledger document's tax snapshot, frozen from the tax quote at the moment the document's tax amounts are written (the Save-time rule, user decision 2026-08-24):

- Manual drafts (Invoice/CN via `readDraftFields`, DN door): lines written in the same transaction as the row at Save; every draft EDIT re-quotes and replaces them (a switch to a tax-free type clears them); posting changes nothing - no re-quote happens at post.
- System documents write lines at their posting-time creation: the interest run, and producer charges through `arGateway.postCharge` (optional `taxQuote` param; the membership fee run, the golf settlement and the golf no-show charge pass their quotes).
- A posted debit's VOID copies the original's lines onto the reversal row (same amounts, same frozen fx - never requoted); a voided draft keeps its lines (audit).
- Receipts are taxless - no lines.
  Documents from before the table have header-only tax (no backfill; the quotes are history).

Shape: `docType` mirrors `Ledger.docType` (user decision; Deposit joins later if deposit billing becomes taxable), `docId`, `mode` + `status` parent-row mirrors (user request 2026-08-24: tax reporting filters and signs lines without joining Ledger - `mode` is immutable with its document, `status` follows every parent transition via `taxLedger.service.syncStatus`, called at post, settle, void, submit-to-approval and the workflow's back-to-draft outcomes), `lineNo` (computation order), scheme/component snapshots (`taxSchemeCode`, `taxCode`, `taxType`, `taxPriority`, `taxRate`), document-currency `taxableAmount`/`taxAmount` + claimable pair, and base-currency `baseTaxableAmount`/`baseTaxAmount`/`baseClaimableAmount` at the document's frozen exchange rate.
The priority semantics come from the Tax calculator's pinned tiers: same priority = parallel on the tier base; a later tier's `taxableAmount` = net + earlier tiers' tax (tax-on-tax - e.g. SC 10% on 200.00 at p1, SST 8% on 220.00 at p2).
Invariant: SUM(lines.taxAmount) == the parent row's `taxAmount` (also per-line `taxType` now passes through `computeTax`).
Writers live in `taxLedger.service.js` (`replaceTaxLines` / `copyTaxLines`) - no other module writes the table.

## Remaining-balance counters (renamed 2026-08-24)

Every materialized document counter stores what REMAINS, not what was applied (user decision: the stored counter reads the way the screens do).
One-shot boot migrations converted existing rows before the alter-sync dropped the old columns; Allocation rows stay the auditable truth and reconciliation asserts every identity below (repair writes the remaining value).

- `Ledger.balanceAmount` (was settledAmount) = `grossAmount` at creation (drafts included; a draft edit keeps it in step with the gross), minus every allocation, to 0 -> `status` flips to `settled`.
  Debit rows: the unsettled balance; credit rows: the credit not yet applied out.
  Void guard: `balanceAmount == grossAmount` (no allocations yet).
  Identity: `balanceAmount == grossAmount - SUM(allocations)`.
- `Receipt.balanceAmount` (was allocatedAmount, inverted) = `amount` at creation, minus every allocation.
  Receipts: the unallocated credit (what reduces pool outstanding); refunds: the UNFUNDED portion - the posting transaction must drive it to 0.
  Void guard: `balanceAmount == amount`.
  Identity: `balanceAmount == amount - SUM(allocations)`.
- `Deposit.balanceAmount` + `Deposit.heldAmount` (were collectedAmount/utilizedAmount): `balanceAmount` = still to collect (= `amount` at creation, reduced by receipt->deposit allocations); `heldAmount` = the held balance (rises with collections, falls with refund allocations and the historical conversion CNs).
  Collected so far derives as `amount - balanceAmount`; closed when `heldAmount == 0` and something was collected; void guard `balanceAmount == amount`.
  Identities: `balanceAmount == amount - SUM(receipt->deposit)`; `heldAmount == SUM(receipt->deposit) - SUM(deposit->refund) - conversions`.

## Built so far

- Slice 1 - masters: `Debtor`, `OtherDebtor` (AR-owned city-ledger party master), `CreditAccount`, `CreditMemberLimit`.
  Provisioning: membership/nominee activation (create, status change, import migration) enqueues `DebtorProvisionRequested` through the gateway (`membership/arProvisioning.js`); the outbox worker calls `debtorProvisioning.service.provisionDebtor` (idempotent find-or-create; existing debtors never overwritten).
  Backfill: `POST /api/membership/debtor-backfill` (gated on `/ar/debtors`).
  Provisioning notifications (2026-08-09): interactive saves stamp `requestedBy` (the caller's userId) + `sourceNo` onto the event; the worker bells that user via `notificationGateway.notifyUser` when the account actually OPENS (`created` true - replays/re-activations stay silent, linkRoute to the debtor detail) and when the event goes terminally FAILED after 5 attempts (retries stay quiet).
  Bulk paths (import migration, backfill) deliberately omit `requestedBy` - their screens already report results, and a 500-row import must not ring the bell 500 times.
  Screens/API: shared Debtor Listing (one list for all three types, party search through the membership seam), ledger-account maintenance, Other Debtor CRUD (party + ledger account in one tx; numbering purpose `ar-other-debtor`).
- Slice 2 - document ledger: `Ledger` (Invoice/DN/CN/Interest with debit/credit mode; invoice void = new credit-mode row + auto-allocation), `Receipt` (receipt/refund), `Deposit` (collateral), `Allocation` (validated pairs: receipt->ledger, ledger->ledger, receipt->deposit, deposit->refund, receipt->refund), `arPosting.service` (integer cents, pool-lock-first, materialized counters), debtor-account screen with entry/void dialogs.
- Slice 3 - periodic: staged interest run (holding header/detail per debtor-month -> review -> selective confirm posts the Interest document) and statements (below).
  `ar.Interest` columns: `companyId`, `debtorId`, `periodMonth` (first of month), `cutoffDate`, `interestRate` (DECIMAL(7,4), the flat monthly % frozen on the header), `graceDays`, `currencyCode` (foreign accounts only), `totalOverdue`, `interestAmount`, `analysis1Id..analysis6Id`, `status`, `postedLedgerId` (the two-way link: the posted document's `sourceModule 'ar'` + `sourceRef` point back), stamps; partial unique month guard `(companyId, debtorId, periodMonth) WHERE status <> 'cancelled'`.
  `ar.InterestDetail`: `interestId`, `chargeId` (the source Ledger row), `docNo`, `docDate`, `dueDate`, `overdueAmount`, `overdueDays`, `interestAmount` (rounded per line; the header is the sum), `isExcluded`, `excludedBy`, `excludedAt`.
  FORMULA (user rule): interestAmount = overdueAmount x interestRate / 100, flat per month, no day proration.
  Pre-post maintenance (approved 2026-09-04): a PENDING run's detail line can be EXCLUDED (and restored) instead of hard-deleted - `PATCH /interest-generations/:id/details/:detailId {excluded}` recomputes the header totals from the included lines in the same tx; confirm refuses a header whose every line is excluded ("cancel this debtor instead"); header removal stays the existing CANCEL (audit kept, month regenerable).
  **Interest is its OWN docType (user decision 2026-09-04; was 'debit-note')**: the run posts `docType 'interest', mode 'debit'`, numbered from its own `ar-interest` series - the ENGINE (FIFO, aging, CN offsets, reconciliation) branches on `mode` so behaviour is unchanged, but interest documents leave the Debit Note listing and get their own READ-ONLY listing `GET /interests` (menu '/ar/interests', web route `ar/interests`, `arDocType 'interest'` on the shared transaction component - no FAB/entry/void; kebab = Allocations + Raise CN).
  `voidLedger` refuses interest outright (correction = Credit Note); a boot data migration outside the fingerprint gate flips pre-existing rows (matched via `sourceRef -> ar.Interest`) plus their TaxLedger `docType` mirror.
  **Run-level analysis dimensions (approved 2026-09-04)**: `ar.Interest.analysis1Id..6Id` freeze the Generate form's picks (`GET /interest-generations/meta` serves `dimensionGateway.entryMeta`; generate validates via `readSelections` with required ENFORCED - the run is interactive, not an exempt system producer); confirm stamps `copyColumns(header)` onto the posted document, so interest joins the per-dimension partial-index reports.
  The finer per-line association stays derivable via `InterestDetail.chargeId -> the source charge's analysis columns` (a future interest-by-dimension report decomposes without any extra storage).
  The same change widened the Allocations viewer gate from '/ar/debtors' to `requireAnyMenuAction(AR_TXN_META_MENUS)` - the kebab shows on every transaction screen, so a receipts-only cashier no longer 403s opening it; '/ar/interests' joins AR_TXN_META_MENUS (viewers only, never the entry doors).
  Web: the drill-down dialog on a pending header gains a per-line block/check_circle toggle (`*appCan` edit on `/ar/interest-generation` - the run screen's route since the Interest Process menu group, 2026-09-05), excluded lines render struck through, and the total row reads "n of m line(s) included".
- Slice 4 - fee runs (membership side producers) and reconciliation (`arReconciliation.service`): `reconcileCompany(companyId, { fix })` checks every invariant (counters, snapshots, fx) and repairs in fix mode; the manual door is `POST /api/ar/reconcile` with body `{ fix: true }` behind `/ar/debtors`.
  `reconcileAllCompanies()` (report-only, drift to the logs) is called by the outbox worker's drain-mode scheduler sweep during the 19:00 UTC hour (03:00 MYT); the poll-mode worker has no nightly call.
- Numbering Control: AR owns `ar.NumberingScheme` (the nine `ar-*` purposes above), screen `/ar/numbering`, endpoints `/api/ar/numbering-schemes` (the shared `platform/numberingController.js` factory behind `/ar/numbering`).
- Producers today: the Membership billing run (`billing.service.js`, `sourceModule 'membership'`) and Golf (`billing.service.postChargeToAccount` for front-desk settlement and group-folio deposits/settlement, `frontdesk.controller` settlement and `noShowCharge.service.postPending`, all `sourceModule 'golf'` through `arGateway.postCharge`; the group folio reads `arGateway.getDocumentStanding` to show "Paid / Partially paid / Outstanding" per on-account deposit).
  `postCharge` enforces the catalog (`usableInModules` must contain the source module, the type must be active, membership-sourced documents additionally need the AR Specification's `membershipIntegration`), refuses foreign-currency accounts, and takes `enforceCredit` (false for billing runs and penalties, true for front-desk charge-to-account).

## AR Transaction screens (hybrid design, 2026-08-12 - invoice first)

- Each manual document type becomes its OWN menu/screen so RBAC can grant per document (a cashier keys receipts without credit-note authority): ALL SIX are built (`/ar/invoices`, `/ar/debit-notes`, `/ar/credit-notes`, `/ar/receipts`, `/ar/refunds`, `/ar/deposits` - completed 2026-09-01).
  The Debtor Account screen stays the account-first INQUIRY surface under `/ar/debtors`.
  **THE FINAL FLIP LANDED 2026-09-01** (all six menus existed): document entry from the account screen takes the DOCUMENT menu's create grant, on both layers.
  Web: each entry button (and the deposit row's Collect, which creates a receipt) gates on `PermissionsService.canOnMenu('create', <doc menu>)` - a NEW strict variant that requires the menu to actually be HELD (the permissive `can()` fallback stays for a screen's own controls; the Raise-CN kebab switched to it too).
  API: `POST /debtors/:id/ledger` resolves the required menu from the requested docType per request (a tiny dispatcher composes `requireMenuAction`), `POST /debtors/:id/receipts` takes '/ar/receipts', `POST /debtors/:id/deposits` takes '/ar/deposits', and the old immediate-post `POST /debtors/:id/refunds` door is REMOVED outright (it bypassed the refund lifecycle and no shipped bundle ever used it).
  The '/ar/debtors' grants keep governing account MAINTENANCE only: the ledger void door, reconcile, backfill.
  Receipt, deposit and refund voids take EITHER '/ar/debtors' OR the document's own menu (`requireAnyMenuAction(['/ar/debtors', '/ar/receipts'])` and so on).
  **RBAC hardening (E2E role test 2026-09-03):** `canModifyRecord` now guards EVERY void branch - `voidReceipt`/`voidDeposit` posted flips and both `voidLedger` branches (draft void + posted-CN reversal) previously skipped the data scope and were reachable cross-scope on allocation-free rows; the web `systemAccessGuard` additionally requires a HELD menu (`PermissionsService.hasMenu`, strict) so a deep link to an ungranted screen redirects to /access-denied instead of rendering the empty shell.
  Beware menu-route typos: `requireMenuAction` deliberately no-ops on uncatalogued routes, so a DB Menu row whose route mis-spells the code's route (found live: '/ar/refund' vs '/ar/refunds') silently UNGATES that screen's whole API surface - verify new menu rows against the route constants.
- One web component serves every type (`ar-transactions`, route `data.arDocType`), and ONE shared entry dialog (`shared/ar-ledger-dialog` for Invoice/DN/CN) is used by BOTH the account screen (debtor preset) and the transaction screens (debtor picker step first - single-dialog rule: picker/entry are `@switch` views in one dialog).
  The picker reuses the Debtor Listing search verbatim: `GET /api/ar/debtor-options` = `debtorController.listDebtors` under `requireAnyMenuAction(AR_TXN_META_MENUS)`; `GET /debtors/:id/account/meta` is gated the same way (the dialog needs billing items/persons/numbering).
  `AR_TXN_MENUS` = the six document menus; `AR_TXN_META_MENUS` = '/ar/debtors' + the six + '/ar/interests' (`ar.routes.js` - extend per slice).
- Per-type endpoints keep the grant honest: `GET /api/ar/invoices` (cross-debtor listing: month + docNo/description search + status, newest first, seam-resolved debtor display + per-row `canModify`), `POST /api/ar/invoices` (docType FORCED server-side - the `/ar/invoices` grant cannot post other kinds; debtorId in the body), `PATCH /api/ar/invoices/:id/void` (404s non-invoice rows).
  The kind-agnostic `POST /debtors/:id/ledger` is per-kind-gated since the final flip (above); `PATCH /ledger/:id/void` remains `/ar/debtors`-gated (account maintenance).
- **The Submit doors** (`POST /invoices/:id/submit`, `/debit-notes/:id/submit`, `/credit-notes/:id/submit`, `/receipts/:id/submit`, `/refunds/:id/submit`, `/deposits/:id/submit`) gate on `requireAnyMenuAction(['/ar/debtors', '<the document's own menu>'])` because submit is reachable from both the document screen and the account screen.
  They used the broad viewer set until 2026-10-12, which let a grant on Interests alone submit every document kind.

## Transaction Type catalog - AR-OWNED (moved from Membership 2026-08-15)

- `ar.TransactionType` (ids preserved from the old membership table - no reference rewriting): `transactionType` code + **`trxClass`** (invoice | debit-note | credit-note | interest | deposit [deposit BILLING] | receipt [debtor payment/collection methods] | refund [refund methods - SPLIT from receipt 2026-08-20: collection and refund are separate menus/grants, and refunds may require workflow approval while receipts do not] | forex [FX gain/loss designation]) + `taxSchemeCode` (single tax source) + `isInterestChargeable` + **`usableInModules`** (JSONB module keys `membership` / `golf` / `facility` / `pos`; enforced at the arGateway POSTING seam, not just pickers; UI offers only ENTITLED modules via `companyHasModule` on the frozen codes) + **`isEInvoice` / `eInvoiceClassificationCode`** (validated against the Control-Plane LHDN list via `serviceContext.eInvoiceClassificationCodeExists`) + `isActive` + stamps.
  No chargeType - debtor ROUTING is producer-decided.
  Payment-method classes (receipt, refund - `PAYMENT_TRX_CLASSES`) carry NO tax scheme, NO interest flag and NO e-Invoice fields.
- Screens: `/ar/transaction-types` (the master, per-class + per-module chips, e-Invoice fields); the membership route `/api/membership/transaction-types` stays as a READ-ONLY GET of membership-usable entries (every other method 410s and points at AR).
  Entry dialogs filter the catalog by their own trxClass.
- **Copy from another company (2026-09-05)**: "Copy from company" (create-gated) opens a centered preview+selection picker - step 1 lists ONLY companies the caller holds an active membership in (`serviceContext.listCallerCompanies`, NOT every account sibling), step 2 previews the source's active entries with already-existing codes marked/unselectable and adaptation notes (tax scheme not usable here -> copies as None; module usability intersects the target's entitlements; e-Invoice drops for non-MY) shown BEFORE the copy.
  Endpoints: `GET /transaction-types/copy-sources`, `GET /transaction-types/copy-sources/:companyId`, `POST /transaction-types/copy {sourceCompanyId, ids}` - all under the '/ar/transaction-types' menu (POST = create flag); the copy re-validates source access, skips existing codes (never overwrites), adapts in one tx, and reports created/skipped/adapted counts.
- **The same copy-from-company pattern extends to Numbering Control and Analysis Setup (2026-09-07)**, same access rule (`listCallerCompanies`), same preview+selection picker, same skip-never-overwrite semantics:
  - **Numbering** (`platform/numberingController.js` factory, so `/membership/numbering`, `/ar/numbering` and `/golf/numbering` all have it): `GET|POST` under `/{module}/numbering-schemes/copy-sources[...]` + `/copy`.
    Copies CONFIGURATION only (mode/prefix/format/pad/starting/reset) - `currentNumber` is always 0 and `currentPeriod` NULL in the target (issued numbers belong to the source's documents); purposes already configured are skipped.
    The preview shows what the FIRST number issued here would look like.
  - **Analysis dimensions** (`/api/dimension/copy-sources[...]` + `/copy`, '/ar/analysis' menu gate): each selected dimension copies with its ACTIVE options and module assignments, adapted - a taken dimension number (or a stamped dimension with no usable module here) lands CATALOG-ONLY; module rows intersect `availableModules`; the parent link is kept only when the parent is copied in the same run (parent-first ordering) or already exists here by name AND the hierarchy rules still hold (stamped-under-stamped, module nesting) - else dropped; option parent links map through copied options or match the existing parent category's options BY CODE, unmatched ones land UNASSIGNED (the setup screen's warn group).
- **Class-first dialog + class-conditional fields (2026-08-19):** New opens a class PICKER view first (one dialog + view signal, single-dialog rule), then the form headed "New transaction type for <class>" shows only what that class uses - `usableInModules` renders for Invoice class ONLY, Tax Scheme is hidden for Receipts (receipts record money in, they never levy tax).
  A Change button re-picks while creating (class-specific values reset); Edit shows the class as a fixed chip (class is immutable on screen).
  `normalizeBody` enforces the same shape server-side: non-invoice -> `usableInModules []` (stripping membership off a referenced entry still hits the 409 reference guard), receipt -> `taxSchemeCode NULL`.
- **AR Spec `membershipIntegration`** (entitlement-gated card): does Membership bill through AR?
  ORTHOGONAL to Club Spec's `creditFacilityEnabled` (frontend charge-to-account) - all four combinations are legitimate customer types.
  Fee/standing-charge runs refuse early when off; `postCharge` re-enforces both usability and the flag for membership-sourced documents.
  AR Spec also designates the Interest type (`interestTransactionTypeId`) and keeps the legacy `depositConversionTransactionTypeId` designation that the refund offset's Credit Note leg still posts under (`catalogDefaults.js` seeds INTEREST/DEPCONV and remembers them on the setting).
- Membership consumers go through **arGateway** (`listTransactionTypes`/`getTransactionType` with module+class filters): fee master rows carry an explicit `MembershipFee.transactionTypeId` (backfilled from the old auto-pick at migration), standing charges keep code references resolved against the catalog, `countTransactionTypeReferences` (membershipGateway) blocks removing 'membership' usability while setups still reference a type.
  Golf resolves the single active invoice-class type opened to `golf` (`billing.service.arInvoiceType`) for settlement and penalties.
- Boot migration (one-shot, old-table-guarded): copy id-preserving with trxClass mapped by code (INTEREST->interest, DEPCONV->credit-note, else invoice) + `usableInModules ['membership']`, backfill fee masters + Setting rows (`membershipIntegration=true` where fee runs exist), then **DROP membership."TransactionType"** (user decision: immediately).

## Credit Note slice (2026-08-20 - second transaction screen)

- `/ar/credit-notes` menu/screen (same `ar-transactions` component via route data) with the SAME Save->Submit lifecycle as invoices, generalized in `LIFECYCLE_KINDS` (arDocument.controller): draft entry/edit, gapless `ar-credit-note` numbering at save, draft-only void with reason, submit -> posted directly or through the `ar-credit-note` workflow purpose (registered alongside ar-invoice; approval posts, rejection returns to Open).
- **Allocation intent on the draft**: `ar.Ledger.applyToLedgerId` (the open debit to apply against) - captured at entry, RESOLVED AT POSTING (which may be after approval).
  If the target got settled/voided in between, the CN posts as available credit (no error).
  `postDraftLedger` applies the intent on credit rows.
  A targeted CN is CAPPED at the target's remaining balance (gross, tax included - checked in the dialog and authoritatively in `readDraftFields`); no target = available credit, uncapped.
  **NO FIFO on manual CN/DN** (user rule 2026-08-20: an adjustment always knows its document - FIFO is receipt behaviour; the short-lived `applyFifo` column was removed, alter-sync drops it).
  Raise-CN LOCKS the target (fixed display) and seeds the amount with the invoice's balance; a fully-allocated or credit-mode row refuses with an error.
  The refund offset's Credit Note leg keeps its internal FIFO (system path).
- The account meta now ships the debtor's `openDebits` (+ `creditNoteApproval` flag) so the standalone CN dialog offers "Apply against" after picking a debtor.
- **Raise Credit Note** kebab on POSTED invoice rows (posted invoices are never voided): opens the CN dialog with the debtor preset and the source invoice pre-selected as the target; gated on the CN menu's create grant (`can('create','/ar/credit-notes')`), not the invoice screen's.
- Voids: CN DRAFTS void like invoice drafts (reason, audit); a POSTED unallocated CN keeps the account-door reversal void (the historical conversion CN void/restore relies on it).
  (DN adopted the same lifecycle with its own slice 2026-09-01 - see below.)

## Official Receipt slice (2026-08-21 - third transaction screen)

- `/ar/receipts` menu/screen (same `ar-transactions` component; its OWN entry dialog `shared/ar-receipt-dialog` - receipts have payment fields, not billing fields).
  Save -> `ar.Receipt` draft (status 'draft', gapless `ar-receipt` number at save, editable, draft-only void WITH reason) -> **Submit posts DIRECTLY** - collections carry NO approval chain (user rule 2026-08-20; the Refund slice does).
  Both doors unified: the Debtor Account door (`POST /debtors/:id/receipts`) also creates drafts through the shared dialog now.
- **Payment method = a Receipt-class Transaction Type** (`Receipt.transactionTypeId`; `paymentMethod` keeps the type CODE as display snapshot; legacy rows keep their free text).
  The catalog's receipt class is finally consumed.
- **Deposit-collection intent on the draft** (`Receipt.collectDepositId`, like the CN's apply-target): resolved at posting - pays the billed deposit in first, then the remainder **always FIFO-allocates** across open items (receipt behaviour; the old autoAllocate opt-out was dropped - excess beyond open items stays as available credit per the 2026-08-04 design).
  Columns also: postedAt/postedBy/voidedAt/voidedBy/voidReason.
- Account meta ships `openDeposits` (billed, not fully collected) for the dialog's Collect-deposit picker; the deposit row's "Collect" button pre-selects it (`presetDepositId`).
- Listing (`GET /receipts`) is shaped like the ledger listings (grossAmount=amount, balanceAmount=unallocated credit -> the Balance column); no Pending-Approval status.
- Draft exclusions wired: statements pull receipts with status 'open' only, reconciliation skips drafts, refund FIFO funding already filtered 'open'.

## Refund slice (2026-08-31 - fourth transaction screen)

- `/ar/refunds` menu/screen (same `ar-transactions` component; its OWN entry dialog `shared/ar-refund-dialog` with a kind-picker step per the `.dlg-pick` standard).
  Save -> `ar.Receipt` draft (docType 'refund', gapless `ar-refund` number at save, editable, draft-only void WITH reason - a POSTED refund is never voided: the money already left, bring it back with a new Official Receipt) -> **Submit posts directly OR through the `ar-refund` workflow purpose** (user rule 2026-08-20: refunds may require approval while collections never do; `pending-approval` while in flight, approval posts via `postDraftRefund` in the completing tx, rejection/recall returns to draft; `Receipt.workflowInstanceId`).
- **Three refund kinds** (user requirements 2026-08-31), captured as `Receipt.refundMode` on the draft and RESOLVED AT POSTING:
  1. **`deposit`** - pay a held deposit back out through the bank: requires an open deposit with sufficient held balance (`collectDepositId` reused for the refund's deposit target); posts the refund + a deposit->refund allocation.
  2. **`credit`** - pay excess/unallocated receipt credit back out through the bank: FIFO-funds from the debtor's open receipt credits (`fundRefundFromCredit`).
  3. **`offset`** - move held deposit against outstanding invoices, NO bank movement: posts the refund funded by the deposit AND, in the same tx, a Credit Note leg (the AR Spec's deposit-conversion designation, tax 0, FIFO across open debits, fx reuses the refund's rate, `sourceModule 'ar'` + `sourceRef` = the refund's id).
     The offset-CN is NOT voidable (`voidLedgerDoc` refuses with a pointer to Debit Note correction); net effect held -X, outstanding -X.
- **Kinds 1 and 2 are bank-facing**: they require a **Refund-class Transaction Type** as the payment method (+ optional payment reference); kind 3 carries none - the dialog shows/hides the payment fields by kind and the server enforces the same shape (`readRefundDraftFields`).
- **Posting REFUSES rather than reroutes** when funding no longer covers (deposit released/short, credit consumed in the meantime) - money out never changes course silently; the refusal names the shortfall so the user can fix and resubmit.
- The refund invariant stands: `Receipt.balanceAmount` (the UNFUNDED portion) must reach 0 inside the posting tx.
  Reconciliation needed no changes - the held/credit formulas already count deposit->refund and receipt->refund allocations, and the offset-CN's `sourceRef` is the refund id (not the deposit id), so deposit-conversion accounting stays keyed correctly.
- Account meta ships ALL open deposits with `heldAmount` (each dialog filters client-side: receipt dialog wants `balanceAmount > 0` to collect, refund dialog wants `heldAmount > 0` to pay out) + a `refundApproval` flag for the Submit button label.
- The Debtor Account screen's old inline refund form was REPLACED by the shared dialog (same component, debtor preset) - one refund door, one behaviour.
- Void: `PATCH /refunds/:id/void` (drafts only) takes '/ar/debtors' or '/ar/refunds'.

## Deposit slice (2026-09-01 - fifth transaction screen)

- `/ar/deposits` menu/screen (same `ar-transactions` component; its OWN entry dialog `shared/ar-deposit-dialog` - opening a deposit is a BILLING act, so the form carries no payment fields, just the required amount).
  Save -> `ar.Deposit` draft (status 'draft', gapless `ar-deposit` number at save, editable, draft-only void WITH reason) -> **Submit posts directly OR through the `ar-deposit` workflow purpose** (a deposit demand is a billing act like an invoice, so it can require approval; `pending-approval` while in flight, approval posts via `postDraftDeposit` in the completing tx, rejection/recall returns to draft; `Deposit.workflowInstanceId` + posting/void audit columns).
- **Posting a deposit is a pure lifecycle flip** - no pool movement, no allocations (deposits are collateral, outside outstanding); it just opens the deposit for collection via Official Receipt.
  Draft deposits are NOT financial: not collectable (the receipt pickers and `collectDepositId` validation filter `status 'open'`), not refundable, held 0 so statements are untouched, and reconciliation's identities hold trivially.
- **Both doors unified** (like receipts): the Debtor Account door (`POST /debtors/:id/deposits`) also creates drafts through the shared dialog now - no door can bypass the lifecycle.
- A POSTED deposit keeps the existing collections-free void flip (now also stamping the audit columns when a reason is given), on `PATCH /deposits/:id/void` ('/ar/debtors' or '/ar/deposits'); the account screen's Collect button stays gated on posted rows.
- Listing (`GET /deposits`) is shaped like the ledger listings; for deposits the Balance column reads "To collect" (`balanceAmount`) and a second "Held" cell shows the collateral currently held; status 'closed' (fully collected and fully drawn down) displays as Posted.
- Account meta ships `depositApproval` for the Submit button label.
- **Deposit conversion no longer exists as its own operation (user decision 2026-09-02: one door):** applying held deposit money to outstanding goes ONLY through the Refund dialog's "Deposit to outstanding" kind - a refund document, a real deposit->refund allocation row, and approval routing.
  The account screen's Convert button, `POST /deposits/:id/convert` and `posting.convertDeposit` are gone.
  HISTORICAL conversion CNs (sourceRef = the deposit's id) remain first-class: their reversal void still restores the deposit's held balance, reconciliation still counts them (`conversionByDeposit`), and the trail viewer below still lists them.
- **Full deposit usage trail in the Allocations viewer (2026-09-02):** for `type=deposit` the drill-down follows the money one hop further than the direct allocation web.
  Each deposit->refund draw carries the refund's OFFSET Credit Note (found by `sourceRef` = the refund's id) and the documents it settled (`onwardVia` + `onward[]` on the allocation row); historical direct conversions (`sourceRef` = the deposit's id, no allocation row) ship as a separate `conversions[]` array with their settlements and any still-unapplied CN credit.
  The viewer nests the hops under their draw with an indented guide line, so "collected 5000 / offset 2000" reads end to end: OR in, refund out via CN, down to each settled invoice.

## Debit Note slice (2026-09-01 - sixth and last transaction screen)

- `/ar/debit-notes` menu/screen (same `ar-transactions` component + the shared ledger dialog - a DN is billing shaped exactly like an invoice, so the slice is pure generalization: a third `LIFECYCLE_KINDS` entry drives the create/edit/submit/void/list factories and the `ar-debit-note` workflow purpose (registered alongside ar-invoice/ar-credit-note; approval posts, rejection returns to Open).
- **The old immediate posting is GONE from both doors**: the account door (`postLedger`) routes DN through `createDraft` like the other lifecycle kinds, and the shared dialog's Post footer is dead code (every ledger kind shows Save / Submit now).
- **A posted DN is immutable** (the invoice rule extended: debit documents are corrected with a Credit Note, never voided - `voidLedger` routes DN to the draft-only void with reason).
  The **Raise Credit Note** kebab therefore appears on posted DN rows too, gated on the CN menu's create grant.
- Tax, fx, analysis dimensions, gapless `ar-debit-note` numbering and the TaxLedger freeze all ride the existing generalized paths - no new columns, no migration.

## Invoice lifecycle (defined 2026-08-13 - Save / Submit / approval)

- User-defined lifecycle for MANUAL invoices: **Save -> `draft`** (screen label "Open": editable by the creator or a superior per data scope, voidable with audit, NOT financial - no balance effect, excluded from statements/aging/interest/allocation/reconciliation) -> **Submit -> posted**, either directly or through the **`ar-invoice` approval chain** (`pending-approval` while in flight; approved posts automatically, rejected/recalled returns to `draft`).
  Internal status vocabulary keeps the engine intact: `draft` | `pending-approval` | `open` | `settled` | `void`, where open/settled = POSTED financially (the engine's open->settled flip still powers allocation); the UI maps draft->"Open", open|settled->"Posted" + a Balance amount (per user: no Settled chip on screen).
  Existing rows needed NO migration.
- THE GAPLESS RULE (firmed up by the user 2026-08-14, superseding the brief number-at-posting design): the series must never SKIP or DUPLICATE **technically** - the counter advances under a SELECT..FOR UPDATE row lock (concurrent users serialise) and commits/rolls back WITH the record that consumes it (`numberingGenerator.issue` with the business transaction - a failed save rewinds the counter).
  Under that rule drafts DO carry their number from SAVE (issued inside the draft-create tx; `docNo` stays NOT NULL), and a voided draft KEEPS its number - **business** gaps in the live sequence are explained by the void audit trail: `voidedAt` / `voidedBy` / `voidReason` (reason REQUIRED on void, shown on the Void card).
  Auto-issued numbers are immutable on edit; manual numbers may be corrected while draft.
  Posting-audit columns: `postedAt`, `postedBy`, `workflowInstanceId`.
- Posted invoices are IMMUTABLE: no void on any door (the account screen's generic void now 400s posted invoices) - correction = raise a Credit Note.
  System producers (fee runs, golf charges, interest, void reversals) still post directly via `postLedgerDoc`.
- FIRST WIRED WORKFLOW PRODUCER: submit calls `workflowGateway.startWorkflow('ar-invoice', ...)` inside the submit tx (null = no chain -> post immediately); completion lands in `src/wiring/workflowHandlers.js` - onApproved posts the draft in the completing tx via `arPosting.postDraftLedger` + `numberingGateway.issueNumberForCompany` (req-less), onRejected/onCancelled flip back to `draft`.
  `GET /debtors/:id/account/meta` ships `invoiceApproval` so the dialog labels its button "Submit for Approval" vs "Submit".
  Tax is quoted at save with onDate=docDate (schemes are effective-dated - no re-quote at post).
- Endpoints: `PATCH /api/ar/invoices/:id` (edit draft; data-scope checked via `canModifyRecord`), `POST /api/ar/invoices/:id/submit` (any-of gate - the account door submits too), void = drafts only.
- Web: the shared ledger dialog gains edit mode + Save / Submit(-for-Approval) footer for invoices (CN adopted it 2026-08-20, DN 2026-09-01 - every ledger kind is a lifecycle kind now); the listing shows Open/Pending Approval/Posted/Void chips + Balance, Edit visible on in-scope drafts, kebab = Submit (confirm states the concrete outcome) + Void.

## Statements (enhanced 2026-08-06)

- Three screens/menus: `/ar/settings` (AR Specification - the per-company options singleton, same role as Club Specification), `/ar/statement-generation` (runs), and `/ar/statements` (pure listing + viewer + void).
- `ar.Setting` per-company singleton, maintained on AR Specification: `statementCutoffDay` (day D = period defaults prev-month D+1 .. this-month D, clamped; NULL = calendar month), aging boundaries `aging1..aging6` (user-defined days, contiguous ascending prefix), the statement layout options (`statementShowLogo`, `statementBrandColor`, `statementShowAging`, `statementShowDeposit`, `statementShowIncurredBy`, `statementShowGeneratedNote`, `statementFooterText`, `statementColumns` - an ordered JSONB array of visible lines-table columns `[{ key: 'date'|'docNo'|'details'|'debit'|'credit'|'balance', label? }]`, NULL = the standard order), `membershipIntegration`, `interestTransactionTypeId`, `depositConversionTransactionTypeId`, `multiCurrencyEnabled`, `fxTransactionTypeId`, stamps.
  `GET /api/ar/settings` is shared with the Generation screen (`requireAnyMenuAction` - its date auto-fill reads the cutoff); `PUT` is Specification-only.
  The screen groups these into three cards (2026-10-28, the settings-chrome regroup): Statement of Account (statement period, aging boundaries, printed layout, table columns and remittance advice as sub-groups; every print option a switch), Membership integration (entitled companies only) and Multi-currency.
- `ar.Statement` is PRINT-COMPLETE: `statementNo` (purpose `ar-statement`, unique per company), `statementDate`, `statementMonth`, `periodStart`/`periodEnd`, party snapshot (`billName`/`billAddress`/`debtorNo`/`contactPerson` for corporate receivers), issuer letterhead (`companyName`/`companyRegistrationNo`/`companyAddress` via `serviceContext.getCompanyLetterhead`), `deposit` balance, `openingBalance`/`closingBalance`, aging amounts `aging1..aging7` (+`agingBoundaries` snapshot - N boundaries print N+1 buckets), `unallocatedAmount`, `currencyCode`, `debtorType` + `debtorCategory` (individual|corporate|nominee|other via `membershipGateway.classifyParties`), `status`.
- `ar.StatementDetail` (renamed from StatementLine): docDate-based lines + running `balance`.
- OVERWRITE semantics: `statementMonth` is the key; regenerating a debtor's month deletes the old statement + details and recreates them (partial unique index, void rows exempt).
- `ar.StatementRun`: BACKGROUND generation jobs (2026-08-08) - the run row itself is the task queue (status `queued` = pending work) and the OUTBOX WORKER drives it in time-boxed slices (`processActiveRuns`, ~20 debtors per chunk, one tx per debtor, `leaseUntil` claim so overlapping drains never double-process, kick-and-detach self-ping continuation + the 5-min sweep as guarantee; `lastProcessedAt` heartbeat, `totalDebtors`/`processedCount`/`generatedCount`/`replacedCount`, `errorMessage`, `notifiedAt`).
  The screen polls `GET /statement-runs/:id` for the live percentage, Cancel settles at the next chunk boundary (`cancelling` -> `cancelled`), `POST /:id/resume` accepts ONLY a `failed` or `cancelled` run and continues exactly at `processedCount`, and the preview endpoint reports "N in scope, M replaced" before starting.
  Completion alerts the initiator exactly once (`notifiedAt` guard): an in-app notification (header bell, `public.Notification` via `platform/notificationGateway.js`) + a templated email (`ar.statement-run-completed`, tenant-overridable, per-company SMTP).
  Worker env needs `FRONTEND_BASE_URL` (email links) and optionally `OUTBOX_WORKER_URL` + self `run.invoker` (continuous slices without waiting for the sweep).
- Aging is as-of periodEnd: debit open items age by `dueDate` (docDate fallback), allocations counted only when the settling credit document's docDate <= periodEnd.
  Buckets are PURE debit-item aging (2026-08-11); the unapplied credit side is stored separately as `unallocatedAmount` (signed, printed in brackets) so buckets + unallocated == closing balance.
  The print adds UNALLOCATED + BALANCE cells after the buckets.
- Print base corrections (2026-08-11, user-marked): letterhead = logo + name + `(companyRegistrationNo)` snapshot + address (title moved below the divider - no collision with long names); right meta block = `Date:` / `From: X to Y` / `Deposit:` (statement number removed from the header, deposit no longer at the bottom); page footer = statement number left, `Page x of y` right.
- PDF (2026-08-11): `GET /api/ar/statements/:id/pdf` renders the Statement of Account with pdfkit from the frozen snapshots only (reprints keep frozen DATA; red VOID marker on voided rows); Download PDF button in the viewer dialog.
  `arStatementPdf.js` is the seam for emailing statements as attachments.
  Builtin fonts are Latin-only - bundle a Unicode TTF before CJK party names go live.
- Statement layout Level 1 (2026-08-11): per-company `ar.Setting.statement*` options brand and trim the ONE standard layout - club logo (Company.logo via the letterhead seam, when `statementShowLogo`), `statementBrandColor` accent (band fills + title; label text flips white/dark by luminance), show/hide toggles (aging strip, deposit, incurred-by, generated note), `statementFooterText` remittance advice, `statementColumns` column order/labels.
  Maintained on AR Specification with a saved-options sample preview (`GET /api/ar/settings/statement-preview`).
  Layout is PRESENTATION resolved at render time; the snapshot data stays frozen.
  Level 2 (structural layout-as-data, EmailTemplate-style override) is designed but deliberately not built; per-company code forks are forbidden.

## Parked design - eliminating `lookupPartyDisplay()` from the Debtor Listing (analysed 2026-08-11)

Decision: KEEP the seam call for now.
Today it is one batched, indexed, in-process read that also powers the listing's snapshot read-repair; full read-model replication becomes worthwhile only when AR actually splits onto its own database.
Revisit in a dedicated Account Receivable session - this section is the build list for that day.

After the `debtorAccount`/`name` snapshots, the listing still takes exactly three things from the seam:

1. The subline chip for membership debtors: `membershipClass` (`individual`/`corporate`).
2. The subline for member (nominee) debtors: the parent contract's number ("of GOLD26-000001").
3. Read-repair itself - the listing can only self-heal stale snapshots because it resolves live values per page.

To eliminate the call entirely:

- **Columns to bring forward** (nullable BY MEANING - each is legitimately absent for the other debtor types): `membershipClass` VARCHAR(20) for membership debtors, `parentAccount` VARCHAR(64) for member debtors.
  Both travel in the provisioning payload like `name` does.
- **Freshness events replace read-repair** - Membership starts publishing party-change events AR consumes to update snapshots:
  member/person name changes (refresh the personal debtor's `name`, and the contract debtor's when the person is the individual principal);
  corporate name changes (contract debtor `name`);
  class conversion individual <-> corporate (the CRM conversions phase makes this real - refresh `membershipClass` + `name`);
  membership/member renumbering (refresh `debtorAccount`/`parentAccount`).
  Every future membership feature touching names must remember the event - that recurring tax is the main cost of going event-only.
- **Search must switch to the snapshot columns** (`debtorAccount`/`name` ILIKE on `ar.Debtor`), replacing `searchPartyIds`.
  Known recall regressions to accept or solve: the native-script `localName` no longer matches (unless it is also snapshotted), and a query matching a nominee's name no longer surfaces the PARENT CONTRACT debtor (today's behaviour, useful because the person's charges live there).
- **Reconciliation stays on the gateway** regardless - it is the independent truth-check comparing snapshots to the source, and between events it is the only automatic corrector.
- Out of scope either way: `lookupPartyBilling` (statement generation) and `classifyParties` (statement scope) are separate seam reads with their own snapshot-at-generation semantics.

## Multi-currency for Other Debtors (design 2026-08-21; steps 1-5 built - COMPLETE)

The design decision that drives everything: **currency per debtor ACCOUNT, never per document.**
An Other Debtor account is denominated in exactly one currency, so every document, receipt, deposit and allocation on it shares that unit and the open-item engine (FIFO, allocation, `CreditAccount.outstanding`, credit limit, aging, statements, interest) stays single-unit per account - cross-currency allocation never arises.
Membership and Nominee accounts always stay in the base currency; a foreign-currency customer that also needs a local account gets a second Other Debtor record.
Base-currency equivalents are stored per row (later steps) for reporting, tax and GL; the only multicurrency arithmetic is realized exchange gain/loss when a receipt's rate differs from the invoice's rate.

- **Base currency** = `Company.defaultCurrencyCode`, read through `serviceContext.getCompanyBaseCurrency` (composes the memoized company basics - no extra query).
  Multi-currency cannot be switched on until it is set.
- **Step 1 (built):** `ar.Setting.multiCurrencyEnabled` gate (same pattern as Club Spec's `creditFacilityEnabled`: off = no currency controls anywhere) + `fxTransactionTypeId` (the ONE Forex-class designation; gain/loss is GL-facing, never a debtor document - collapsed from a gain/loss pair 2026-09-07, the sign of `Allocation.fxGainLoss` carries direction); the **Multi-currency** card on AR Specification (prerequisite readout, toggle disabled without a base currency, the picker).
  `ar.ExchangeRate` (`companyId`, `currencyCode` alpha-3, `effectiveDate`, `rate` DECIMAL(21,10), stamps; UNIQUE company+currency+date): 1 unit of the foreign currency = `rate` units of base; lookup = latest `effectiveDate <= docDate`.
  Documents SNAPSHOT the rate they used, so editing/deleting a rate only changes future defaults - that is why delete is allowed.
  Screen `/ar/exchange-rates` (its own menu; standard listing: search, card per rate with a Current/Upcoming chip, drawer dialog with a live "1 USD = 4.7100 MYR" preview, kebab Delete with confirm, scroll-return); API `GET /exchange-rates/meta` (base + subscriber's foreign currencies + gate), `GET/POST /exchange-rates`, `PUT/DELETE /exchange-rates/:id`, every part Zod-validated inside the controller, currency must be in the subscriber set and not the base.
- **Step 2 (built 2026-08-21):** `Debtor.currencyCode` + `OtherDebtor.currencyCode` (alpha-3; nullable only for the backfill window - boot stamps `Company.defaultCurrencyCode` onto NULLs, and readers treat NULL as base via `arCurrency.service.effectiveCurrency`).
  `arCurrency.service` holds the rules: `getMultiCurrencyState` (gate + base + subscriber set, empty when off), `resolveOtherDebtorCurrency` (foreign currency only while the gate is on and the code is in the subscriber set - never silently downgraded), `accountHasDocuments` (any Ledger/Receipt/Deposit row, drafts included = currency immutable; the edit door 409s and tells the user to open a separate Other Debtor).
  `provisionDebtor` stamps membership/member accounts with the base currency always, Other Debtors with the resolved code (replays fill a NULL once, never overwrite).
  Doors: `GET /debtors/meta` ships `multiCurrencyEnabled`/`baseCurrencyCode`/`currencies`; `GET /debtors?currency=` filters (base also matches NULL rows) and every row carries `currencyCode`; Other Debtor GET ships `currencyCode` + `currencyLocked`; POST/PATCH accept `currencyCode`; the account payload carries the gate + `debtor.currencyCode`.
  Screens: Debtor Listing currency filter + per-card chip (brand-tinted when foreign) and the Other Debtor dialog's Account currency picker (preset to base, disabled with a lock note once documents exist) - all hidden while the gate is off; Debtor Account shows a Currency tile.
- **Step 3 (built 2026-08-21):** `Ledger.currencyCode / exchangeRate DECIMAL(21,10) / baseNetAmount / baseTaxAmount / baseGrossAmount`, `Receipt.currencyCode / exchangeRate / baseAmount`, `Deposit.currencyCode / exchangeRate / baseAmount` (nullable for the backfill window: boot stamps the account currency, and rate 1 + base == amounts on base-currency rows; a foreign row from before its rate existed keeps NULL and resolves at re-save / posting).
  ONE resolution seam - `arCurrency.resolveDocumentFx({ companyId, debtor, docDate, requestedRate })` -> `{ currencyCode, exchangeRate, isBase }`: base account = rate 1 with no lookup; foreign account = the keyed rate, else `ExchangeRate` at docDate, else a 400 naming what to do.
  Every row creation stamps through it: `postLedgerDoc` (accepts `exchangeRate` keyed or an already-resolved `fx` - void reversals reuse the ORIGINAL rate so the pair nets to zero in base), `postDraftLedger` / `postDraftReceipt` (rate frozen at save; a rate-less draft resolves at posting), `postReceipt` / `postRefund`, the draft doors (`readDraftFields` / `readReceiptDraftFields` via `readFx`), and `postDeposit`.
  `arGateway.postCharge` refuses producer charges on a foreign-currency account (producer tariffs are priced in base; a document is never silently relabelled).
  Account meta ships `currency { code, baseCurrencyCode, isBase, rates[] }` so the dialogs default the rate per document date client-side; listings and account books ship `currencyCode` / `exchangeRate` / base gross.
  Screens: the ledger and receipt dialogs + the account page's refund and deposit forms show an **Exchange rate** field on foreign accounts only (typed decimal, never a spin control; defaults from the rate table at the document date until keyed; a live "base equivalent" readout), and the debtor band carries a "USD account" chip.
  Shared helpers in `web/shared/ar-fx.ts`.
- **Step 4 (built 2026-08-26, LIVE):** `Allocation.fxGainLoss` DECIMAL(21,2) + `Allocation.fxTransactionTypeId` - the REALIZED exchange difference of every allocation, computed inside `applyAllocation`:
  `fxGainLoss = amount x (credit doc rate - debit doc rate)` in base cents (`allocationFxCents`, same integer-cents rounding as the documents' base equivalents; positive = gain).
  Both rates are frozen on the documents, so the delta per pair never changes: upserts accumulate `fxGainLoss` with `amount`, and the sign never flips.
  A nonzero difference is classified under the ONE AR Specification Forex designation (`resolveFxDesignation` -> `ar.Setting.fxTransactionTypeId`; gain vs loss is read from the SIGN of `Allocation.fxGainLoss`, never from the type); an unset designation makes the posting refuse with the fix named - explicit configuration, never inferred.
  `applyAllocation` also asserts both documents carry the SAME currency (always true by the account-currency design; a mismatch means drift and 409s to Reconcile).
  Reconciliation asserts `fxGainLoss` against the two documents' frozen rates per allocation row (fix mode repairs); a NULL (pre-column row) is STAMPED additively every run like the display snapshots (`fxStamped` in the checked counts), and an allocation whose documents no longer resolve is reported as unresolvable.
  The allocation drill-down (`GET /documents/:type/:id/allocations`) ships the new columns automatically (raw rows).
- **Step 5 (built 2026-08-26):** currency snapshots + display polish, closing the design.
  `Statement.currencyCode` and `Interest.currencyCode` snapshot the account currency at generation - **foreign accounts only, NULL = base** - so single-currency companies see zero change and no backfill is needed.
  The statement viewer and PDF print a "Currency" meta line on foreign statements; the interest run's flash and the review screen's Post button report totals **per currency, never summed across units** (`generateInterest` returns `totals: [{currencyCode, amount}]`); listing rows (statements, interest headers, and the invoice/CN/receipt transaction screens via a top-level `baseCurrencyCode`) carry a brand-tinted currency chip when foreign.
  The allocations drill-down became a real viewer: `GET /documents/:type/:id/allocations` resolves counterpart document numbers and the Forex designation names server-side, and the transaction screens' posted-row kebab gained **Allocations** - a centered viewer listing "Settled by / Applied to <doc> <amount>" per allocation with its realized exchange gain/loss line (`fxGainLoss` + designation) when nonzero.
  Out of scope by decision: per-document currency on one account, month-end revaluation (a later report over base equivalents), Membership fee currencies.

## Public API (gateway seam `/api/ar`)

Everything except `/health` sits behind `verifyToken` + `requireModule('AR')`; the menu per route is shown in brackets.

- `GET /health` - liveness (unauthenticated).
- Debtors ('/ar/debtors'): `GET /debtors/meta`, `GET /debtors` (paged listing: type/status/currency filters, party search through the seam, sort by `debtorAccount`/`name`), `PATCH /debtors/:id` (terms, reminders, interest, status; credit limit only for Other Debtors), `GET|POST /other-debtors[/:id]`, `PATCH /other-debtors/:id`, `POST /reconcile { fix? }`.
- Debtor account: `GET /debtors/:id/account` ('/ar/debtors'), `GET /debtors/:id/account/meta` (META menus), `GET /documents/:type/:id/allocations` and `GET /documents/:type/:id/tax-lines` (META menus), `POST /debtors/:id/ledger` (the document's menu by `docType`), `POST /debtors/:id/receipts` ('/ar/receipts'), `POST /debtors/:id/deposits` ('/ar/deposits'), `PATCH /ledger/:id/void` ('/ar/debtors'), `PATCH /receipts/:id/void` and `PATCH /deposits/:id/void` ('/ar/debtors' or the document menu).
- Transaction screens: `GET /debtor-options` (META menus) and, per kind under its own menu, `GET /invoices|debit-notes|credit-notes|receipts|refunds|deposits` (listing), `POST /<kind>` (create draft), `PATCH /<kind>/:id` (edit draft), `POST /<kind>/:id/submit` (META menus today, see above), `PATCH /invoices|debit-notes|credit-notes/:id/void` (own menu) and `PATCH /refunds/:id/void` ('/ar/debtors' or '/ar/refunds'); `GET /interests` ('/ar/interests', read-only).
- Transaction Types ('/ar/transaction-types'): `GET /transaction-types/meta`, `GET /transaction-types/tax-schemes`, `GET /transaction-types`, `POST /transaction-types`, `PUT /transaction-types/:id`, `PATCH /transaction-types/:id`, `GET /transaction-types/copy-sources[/:companyId]`, `POST /transaction-types/copy`.
- Exchange rates ('/ar/exchange-rates'): `GET /exchange-rates/meta`, `GET|POST /exchange-rates`, `PUT|DELETE /exchange-rates/:id`.
- Numbering ('/ar/numbering'): `/numbering-schemes` (GET /meta, GET /, POST /, PATCH /:id, POST /preview, GET /copy-sources[/:companyId], POST /copy).
- Interest ('/ar/interest-generation'; the drill-down also '/ar/interests'): `GET /interest-generations/meta`, `GET /interest-generations`, `POST /interest-generations` (generate), `GET /interest-generations/:id`, `PATCH /interest-generations/:id/details/:detailId`, `POST /interest-generations/confirm`, `POST /interest-generations/:id/cancel`.
- AR Specification: `GET /settings` ('/ar/settings' or '/ar/statement-generation'), `PUT /settings` and `GET /settings/statement-preview` ('/ar/settings').
- Statement runs ('/ar/statement-generation'): `POST /statement-runs/preview`, `POST /statement-runs`, `GET /statement-runs`, `GET /statement-runs/:id`, `POST /statement-runs/:id/resume`, `POST /statement-runs/:id/cancel`.
- Statements ('/ar/statements'): `GET /statements`, `GET /statements/:id`, `GET /statements/:id/pdf`, `PATCH /statements/:id/void`.
- Anything else answers `501` so a caller can tell "wrong URL" from "planned but not implemented".

## Not built yet

Facility and POS producers (the `arGateway` contract and the catalog's `usableInModules` already accept `facility` and `pos`), the 'debtor' payment class on the golf front desk (an arbitrary AR account as tender), statement EMAIL delivery (PDF renderer is ready as the attachment seam), month-end revaluation, and the conversions phase of the membership CRM.
