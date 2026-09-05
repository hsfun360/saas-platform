# Account Receivable (AR)

The open-item debtor ledger for the whole platform.
Every product (Membership, Golf, Facility, POS) is a producer that posts resolved charges into AR; AR owns balances, credit control, receipts/allocation, statements and late-payment interest.
That producer/ledger boundary is why AR is its own service and not part of Membership.

- **Module folder:** `src/modules/ar`
- **Gateway base:** `/api/ar`
- **Schema:** `ar` (registered in `platform/schemas.js`)
- **Seams:**
  - `platform/arGateway.js` - producers -> AR. Writes travel as outbox events (today: `DebtorProvisionRequested`; the charge-posting/authorize seam lands with the ledger slice).
  - `platform/membershipGateway.js` - AR -> Membership party-master READS (display names, listing search). AR never requires membership models directly.
- **Entitlement:** `requireModule('Account Receivable')` - the Module row must carry exactly that name.

## Design decisions (approved 2026-08-04/05)

The full agreed design (Debtor shape, charge routing by category, credit checking, open-item ledger with Invoice/DN/CN + Official Receipt/Refund + Deposit, allocation matrix, interest generation, statements) is recorded in the project memory `ar-debtor-design` and in the conversation of 2026-08-05.
Key rules a maintainer must not break:

- Debtor is THIN: `(companyId, debtorType 'membership'|'member'|'other', sourceId)` + credit terms/prefs. Party data stays with the party master; documents snapshot it at generation time. The pointer NEVER lives on the membership side.
- **Terminology standard (user decision 2026-08-20): the 'member' debtor type reads "Nominee" everywhere users see it** (listing filter/chips, billing detail "Membership debtor / Nominee debtor") - a member-type ledger account only ever belongs to a nominee, since individual members share the membership debtor and dependents never get one. The stored key stays 'member'; "personal" survives only in the per-person credit-cap wording ("Personal credit limit exceeded"), which is a different concept.
- The ONE deliberate exception to thin: `debtorAccount` + `name` (approved 2026-08-11) are SORT-KEY SNAPSHOTS of the party's number/display name, so the paged listing can `ORDER BY` them (live display data resolves through the seam AFTER the page query and cannot be ordered on).
  The listing still displays live-resolved values - a stale snapshot can only mis-order, never mis-display.
  Freshness: stamped from the provisioning payload (event-carried state; replays fill NULLs but never overwrite), refreshed same-tx on Other Debtor saves, read-repaired by the listing when a page's live value differs, and verified by reconciliation (missing = stamped every run; drift = reported, repaired in fix mode; unresolvable party = reported).
  NOT NULL since 2026-08-11 (backfill verified zero NULLs first): a ledger account can never exist without number + name; a provisioning payload without them fails and retries via the outbox.
- Hot balances live in `CreditAccount` (pool) and `CreditMemberLimit` (per-person caps, row = capped person only), materialized in the same tx as every posting, pool row locked first.
- After first provisioning, AR owns the credit terms (the membership screen shows them read-only).
- Dependents never get debtor rows; their charges resolve to the principal at posting time.
- Every document table (Ledger, Receipt, Deposit) carries BOTH `docDate` and `trxDate`.
  `docDate` is the actual occurrence date - it drives aging and `dueDate` and prints on the document.
  `trxDate` is the accounting-period (GL) date - defaults to `docDate`, but a forgotten last-month document keyed after the period closed keeps last month's `docDate` with a current-month `trxDate`.
  Aging/statements bucket by `docDate`/`dueDate`; financial-period reporting buckets by `trxDate`.

## Financial-analysis dimensions (hybrid design 2026-08-25; catalog owned by the shared Dimension capability)

The catalog (`dimension.DimensionCategory` + `dimension.DimensionOption`, `dimensionNo` 1..6 assignment, repurpose lock) is OWNED by the shared Dimension service - see [dimension.md](dimension.md); AR consumes it through `platform/dimensionGateway.js`, never the models.
AR's side:

- `ar.Ledger.analysis1Id..analysis6Id`: the analysis columns (option ids), each with a **partial index** `(analysisNId, trxDate) WHERE NOT NULL` - only tagged rows are indexed, so the sparse NULL majority costs nothing and reports stay `GROUP BY` one column with no junction pivot. An option id implies its company + category, so no companyId prefix is needed.
- Doors: manual drafts + the DN door validate `body.analysis` (`{ "<dimensionNo>": optionId }`) through `dimensionGateway.readSelections` (dimension assigned + active, option of that category + active, required enforced - system producers exempt) and stamp the columns; void reversals COPY the original's columns so per-dimension reports net the pair; `postLedgerDoc` accepts `analysisColumns` for future producers. Account meta ships `analysis` (from `dimensionGateway.entryMeta`) - the entry dialog renders one picker per number-assigned dimension, labelled with the company's names; listings ship the ids for draft-edit prefill.
- AR registers the Dimension usage check in `src/wiring/dimensionUsage.js` (any `analysis<N>Id` referencing the category's options = dimension number locked).
- Screens: `/ar/analysis` "Analysis Setup" master-detail (dimensions left with Dimension-number/required/count chips, selected dimension's options right; URL-driven selection; drawer dialogs; enable/disable in kebabs) - a thin client of `/api/dimension`. USER MUST ADD MENU '/ar/analysis' (icon `category`).
- Receipts/Deposits carry no dimensions yet; a per-dimension revenue report screen is a future consumer of the partial indexes.

## Tax breakdown - `ar.TaxLedger` (2026-08-24)

One row per rate component of the scheme behind a Ledger document's tax snapshot, frozen from the tax quote at the moment the document's tax amounts are written (the Save-time rule, user decision 2026-08-24):

- Manual drafts (Invoice/CN via `readDraftFields`, DN door): lines written in the same transaction as the row at Save; every draft EDIT re-quotes and replaces them (a switch to a tax-free type clears them); posting changes nothing - no re-quote happens at post.
- System documents write lines at their posting-time creation: the interest run, and producer charges through `arGateway.postCharge` (new optional `taxQuote` param; the membership fee run passes its quote).
- A posted debit's VOID copies the original's lines onto the reversal row (same amounts, same frozen fx - never requoted); a voided draft keeps its lines (audit).
- Deposit-conversion CNs and receipts are taxless - no lines. Documents from before the table have header-only tax (no backfill; the quotes are history).

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
- `Deposit.balanceAmount` + `Deposit.heldAmount` (were collectedAmount/utilizedAmount): `balanceAmount` = still to collect (= `amount` at creation, reduced by receipt->deposit allocations); `heldAmount` = the held balance (rises with collections, falls with refund allocations and conversion CNs).
  Collected so far derives as `amount - balanceAmount`; closed when `heldAmount == 0` and something was collected; void guard `balanceAmount == amount`.
  Identities: `balanceAmount == amount - SUM(receipt->deposit)`; `heldAmount == SUM(receipt->deposit) - SUM(deposit->refund) - conversions`.

## Built so far

- Slice 1 - masters: `Debtor`, `OtherDebtor` (AR-owned city-ledger party master), `CreditAccount`, `CreditMemberLimit`.
  Provisioning: membership/nominee activation (create, status change, import migration) enqueues `DebtorProvisionRequested` through the gateway; the outbox worker calls `debtorProvisioning.service` (idempotent find-or-create; existing debtors never overwritten). Backfill: `POST /api/membership/debtor-backfill`.
  Provisioning notifications (2026-08-09): interactive saves stamp `requestedBy` (the caller's userId) + `sourceNo` onto the event; the worker bells that user via `notificationGateway.notifyUser` when the account actually OPENS (`created` true - replays/re-activations stay silent, linkRoute to the debtor detail) and when the event goes terminally FAILED after 5 attempts (retries stay quiet).
  Bulk paths (import migration, backfill) deliberately omit `requestedBy` - their screens already report results, and a 500-row import must not ring the bell 500 times.
  Screens/API: shared Debtor Listing (one list for all three types, party search through the membership seam), ledger-account maintenance, Other Debtor CRUD (party + ledger account in one tx; numbering purpose `ar-other-debtor`).
- Slice 2 - document ledger: `Ledger` (Invoice/DN/CN with debit/credit mode; invoice void = new credit-mode row + auto-allocation), `Receipt` (receipt/refund), `Deposit` (collateral, converted to CN via the DEPCONV process), `Allocation` (validated pairs), `arPosting.service` (integer cents, pool-lock-first, materialized counters), debtor-account screen with entry/void dialogs.
- Slice 3 - periodic: staged interest run (holding header/detail per debtor-month -> review -> selective confirm posts the INTEREST Debit Note) and statements (below).
  Pre-post maintenance (approved 2026-09-04): a PENDING run's detail line can be EXCLUDED (and restored) instead of hard-deleted - `InterestDetail.isExcluded/excludedBy/excludedAt`, `PATCH /interest-generations/:id/details/:detailId {excluded}` recomputes the header totals from the included lines in the same tx; confirm refuses a header whose every line is excluded ("cancel this debtor instead"); header removal stays the existing CANCEL (audit kept, month regenerable).
  **Interest is its OWN docType (user decision 2026-09-04; was 'debit-note')**: the run posts `docType 'interest', mode 'debit'` - the ENGINE (FIFO, aging, CN offsets, reconciliation) branches on `mode` so behaviour is unchanged, but interest documents leave the Debit Note listing and get their own READ-ONLY listing `GET /interests` (menu '/ar/interests', web route `ar/interests`, `arDocType 'interest'` on the shared transaction component - no FAB/entry/void; kebab = Allocations + Raise CN).
  `voidLedger` refuses interest outright (correction = Credit Note); a boot data migration outside the fingerprint gate flips pre-existing rows (matched via `sourceRef -> ar.Interest`) plus their TaxLedger `docType` mirror.
  **Run-level analysis dimensions (approved 2026-09-04)**: `ar.Interest.analysis1Id..6Id` freeze the Generate form's picks (`GET /interest-generations/meta` serves `dimensionGateway.entryMeta`; generate validates via `readSelections` with required ENFORCED - the run is interactive, not an exempt system producer); confirm stamps `copyColumns(header)` onto the posted document, so interest joins the per-dimension partial-index reports. The finer per-line association stays derivable via `InterestDetail.chargeId -> the source charge's analysis columns` (a future interest-by-dimension report decomposes without any extra storage).
  The same change widened the Allocations viewer gate from '/ar/debtors' to `requireAnyMenuAction(AR_TXN_META_MENUS)` - the kebab shows on every transaction screen, so a receipts-only cashier no longer 403s opening it; '/ar/interests' joins AR_TXN_META_MENUS (viewers only, never the entry doors).
  Web: the drill-down dialog on a pending header gains a per-line block/check_circle toggle (`*appCan` edit on `/ar/interest-generation` - the run screen's route since the Interest Process menu group, 2026-09-05), excluded lines render struck through, and the total row reads "n of m line(s) included".
- Slice 4 - fee runs (membership side producers) and the nightly reconciliation sweep (`arReconciliation.service`, invariant checks + `?fix=1`).
- Numbering Control: AR owns `ar.NumberingScheme` (purposes `ar-*`), screen `/ar/numbering`.

## AR Transaction screens (hybrid design, 2026-08-12 - invoice first)

- Each manual document type becomes its OWN menu/screen so RBAC can grant per document (a cashier keys receipts without credit-note authority): ALL SIX are built (`/ar/invoices`, `/ar/debit-notes`, `/ar/credit-notes`, `/ar/receipts`, `/ar/refunds`, `/ar/deposits` - completed 2026-09-01).
  The Debtor Account screen stays the account-first INQUIRY surface under `/ar/debtors`.
  **THE FINAL FLIP LANDED 2026-09-01** (all six menus existed): document entry from the account screen takes the DOCUMENT menu's create grant, on both layers.
  Web: each entry button (and the deposit row's Collect, which creates a receipt) gates on `PermissionsService.canOnMenu('create', <doc menu>)` - a NEW strict variant that requires the menu to actually be HELD (the permissive `can()` fallback stays for a screen's own controls; the Raise-CN kebab switched to it too).
  API: `POST /debtors/:id/ledger` resolves the required menu from the requested docType per request (a tiny dispatcher composes `requireMenuAction`), `POST /debtors/:id/receipts` takes '/ar/receipts', `POST /debtors/:id/deposits` takes '/ar/deposits', and the old immediate-post `POST /debtors/:id/refunds` door is REMOVED outright (it bypassed the refund lifecycle and no shipped bundle ever used it).
  The '/ar/debtors' grants keep governing account MAINTENANCE only: voids, deposit conversion, reconcile, backfill.
  **RBAC hardening (E2E role test 2026-09-03):** `canModifyRecord` now guards EVERY void branch - `voidReceipt`/`voidDeposit` posted flips and both `voidLedger` branches (draft void + posted-CN reversal) previously skipped the data scope and were reachable cross-scope on allocation-free rows; the web `systemAccessGuard` additionally requires a HELD menu (`PermissionsService.hasMenu`, strict) so a deep link to an ungranted screen redirects to /access-denied instead of rendering the empty shell.
  Beware menu-route typos: `requireMenuAction` deliberately no-ops on uncatalogued routes, so a DB Menu row whose route mis-spells the code's route (found live: '/ar/refund' vs '/ar/refunds') silently UNGATES that screen's whole API surface - verify new menu rows against the route constants.
- One web component serves every type (`ar-transactions`, route `data.arDocType`), and ONE shared entry dialog (`shared/ar-ledger-dialog` for Invoice/DN/CN) is used by BOTH the account screen (debtor preset) and the transaction screens (debtor picker step first - single-dialog rule: picker/entry are `@switch` views in one dialog).
  The picker reuses the Debtor Listing search verbatim: `GET /api/ar/debtor-options` = `debtorController.listDebtors` under `requireAnyMenuAction` of the transaction menus (`AR_TXN_MENUS` in `ar.routes.js` - extend per slice); `GET /debtors/:id/account/meta` is re-gated the same way (the dialog needs billing items/persons/numbering).
- Per-type endpoints keep the grant honest: `GET /api/ar/invoices` (cross-debtor listing: month + docNo/description search + status, newest first, seam-resolved debtor display + per-row `canModify`), `POST /api/ar/invoices` (docType FORCED server-side - the `/ar/invoices` grant cannot post other kinds; debtorId in the body), `PATCH /api/ar/invoices/:id/void` (404s non-invoice rows).
  The kind-agnostic `POST /debtors/:id/ledger` is per-kind-gated since the final flip (above); `PATCH /ledger/:id/void` remains `/ar/debtors`-gated (account maintenance).

## Transaction Type catalog - AR-OWNED (moved from Membership 2026-08-15)

- `ar.TransactionType` (ids preserved from the old membership table - no reference rewriting): `transactionType` code + **`trxClass`** (invoice | debit-note | credit-note | interest | deposit [deposit BILLING] | receipt [debtor payment/collection methods] | refund [refund methods - SPLIT from receipt 2026-08-20: collection and refund are separate menus/grants, and refunds may require workflow approval while receipts do not] | forex [future FX gain/loss]) + tax scheme (single tax source) + `isInterestChargeable` + **`usableInModules`** (module keys; enforced at the arGateway POSTING seam, not just pickers; UI offers only ENTITLED modules) + **`isEInvoice` / `eInvoiceClassificationCode`** (validated against the Control-Plane LHDN list via serviceContext). No chargeType - debtor ROUTING is producer-decided. Payment-method classes (receipt, refund - `PAYMENT_TRX_CLASSES`) carry NO tax scheme, NO interest flag and NO e-Invoice fields.
- Screens: `/ar/transaction-types` (the master, per-class + per-module chips, e-Invoice fields); the membership route stays as a READ-ONLY view of membership-usable entries (writes 410 -> point at AR). Entry dialogs filter the catalog by their own trxClass.
- **Class-first dialog + class-conditional fields (2026-08-19):** New opens a class PICKER view first (one dialog + view signal, single-dialog rule), then the form headed "New transaction type for <class>" shows only what that class uses - `usableInModules` renders for Invoice class ONLY, Tax Scheme is hidden for Receipts (receipts record money in, they never levy tax). A Change button re-picks while creating (class-specific values reset); Edit shows the class as a fixed chip (class is immutable on screen). `normalizeBody` enforces the same shape server-side: non-invoice -> `usableInModules []` (stripping membership off a referenced entry still hits the 409 reference guard), receipt -> `taxSchemeCode NULL`.
- **AR Spec `membershipIntegration`** (entitlement-gated card): does Membership bill through AR? ORTHOGONAL to Club Spec's `creditFacilityEnabled` (frontend charge-to-account) - all four combinations are legitimate customer types. Fee/standing-charge runs refuse early when off; `postCharge` re-enforces both usability and the flag for membership-sourced documents. AR Spec also designates the Interest and Deposit-conversion types (`catalogDefaults.js` seeds INTEREST/DEPCONV and remembers them on the setting).
- Membership consumers go through **arGateway** (`listTransactionTypes`/`getTransactionType` with module+class filters): fee master rows carry an explicit `MembershipFee.transactionTypeId` (backfilled from the old auto-pick at migration), standing charges keep code references resolved against the catalog, `countTransactionTypeReferences` (membershipGateway) blocks removing 'membership' usability while setups still reference a type.
- Boot migration (one-shot, old-table-guarded): copy id-preserving with trxClass mapped by code (INTEREST->interest, DEPCONV->credit-note, else invoice) + `usableInModules ['membership']`, backfill fee masters + Setting rows (`membershipIntegration=true` where fee runs exist), then **DROP membership."TransactionType"** (user decision: immediately).

## Credit Note slice (2026-08-20 - second transaction screen)

- `/ar/credit-notes` menu/screen (same `ar-transactions` component via route data) with the SAME Save->Submit lifecycle as invoices, generalized in `LIFECYCLE_KINDS` (arDocument.controller): draft entry/edit, gapless `ar-credit-note` numbering at save, draft-only void with reason, submit -> posted directly or through the `ar-credit-note` workflow purpose (registered alongside ar-invoice; approval posts, rejection returns to Open).
- **Allocation intent on the draft**: `ar.Ledger.applyToLedgerId` (the open debit to apply against) - captured at entry, RESOLVED AT POSTING (which may be after approval). If the target got settled/voided in between, the CN posts as available credit (no error). `postDraftLedger` applies the intent on credit rows. A targeted CN is CAPPED at the target's remaining balance (gross, tax included - checked in the dialog and authoritatively in `readDraftFields`); no target = available credit, uncapped. **NO FIFO on manual CN/DN** (user rule 2026-08-20: an adjustment always knows its document - FIFO is receipt behaviour; the short-lived `applyFifo` column was removed, alter-sync drops it). Raise-CN LOCKS the target (fixed display) and seeds the amount with the invoice's balance; a fully-allocated or credit-mode row refuses with an error. The deposit-conversion CN keeps its internal FIFO (system path).
- The account meta now ships the debtor's `openDebits` (+ `creditNoteApproval` flag) so the standalone CN dialog offers "Apply against" after picking a debtor.
- **Raise Credit Note** kebab on POSTED invoice rows (posted invoices are never voided): opens the CN dialog with the debtor preset and the source invoice pre-selected as the target; gated on the CN menu's create grant (`can('create','/ar/credit-notes')`), not the invoice screen's.
- Voids: CN DRAFTS void like invoice drafts (reason, audit); a POSTED unallocated CN keeps the account-door reversal void (deposit-conversion CN void/restore relies on it). (DN adopted the same lifecycle with its own slice 2026-09-01 - see below.)

## Official Receipt slice (2026-08-21 - third transaction screen)

- `/ar/receipts` menu/screen (same `ar-transactions` component; its OWN entry dialog `shared/ar-receipt-dialog` - receipts have payment fields, not billing fields). Save -> `ar.Receipt` draft (status 'draft', gapless `ar-receipt` number at save, editable, draft-only void WITH reason) -> **Submit posts DIRECTLY** - collections carry NO approval chain (user rule 2026-08-20; the Refund slice will). Both doors unified: the Debtor Account door (`POST /debtors/:id/receipts`) also creates drafts through the shared dialog now.
- **Payment method = a Receipt-class Transaction Type** (new `Receipt.transactionTypeId`; `paymentMethod` keeps the type CODE as display snapshot; legacy rows keep their free text). The catalog's receipt class is finally consumed.
- **Deposit-collection intent on the draft** (new `Receipt.collectDepositId`, like the CN's apply-target): resolved at posting - pays the billed deposit in first, then the remainder **always FIFO-allocates** across open items (receipt behaviour; the old autoAllocate opt-out was dropped - excess beyond open items stays as available credit per the 2026-08-04 design). New columns also: postedAt/postedBy/voidedAt/voidedBy/voidReason.
- Account meta ships `openDeposits` (billed, not fully collected) for the dialog's Collect-deposit picker; the deposit row's "Collect" button pre-selects it (`presetDepositId`).
- Listing (`GET /receipts`) is shaped like the ledger listings (grossAmount=amount, balanceAmount=unallocated credit -> the Balance column); no Pending-Approval status.
- Draft exclusions wired: statements pull receipts with status 'open' only, reconciliation skips drafts, refund FIFO funding already filtered 'open'.

## Refund slice (2026-08-31 - fourth transaction screen)

- `/ar/refunds` menu/screen (same `ar-transactions` component; its OWN entry dialog `shared/ar-refund-dialog` with a kind-picker step per the `.dlg-pick` standard).
  Save -> `ar.Receipt` draft (docType 'refund', gapless `ar-refund` number at save, editable, draft-only void WITH reason - a POSTED refund is never voided: the money already left, bring it back with a new Official Receipt) -> **Submit posts directly OR through the `ar-refund` workflow purpose** (user rule 2026-08-20: refunds may require approval while collections never do; `pending-approval` while in flight, approval posts via `postDraftRefund` in the completing tx, rejection/recall returns to draft; new `Receipt.workflowInstanceId`).
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

## Deposit slice (2026-09-01 - fifth transaction screen)

- `/ar/deposits` menu/screen (same `ar-transactions` component; its OWN entry dialog `shared/ar-deposit-dialog` - opening a deposit is a BILLING act, so the form carries no payment fields, just the required amount).
  Save -> `ar.Deposit` draft (status 'draft', gapless `ar-deposit` number at save, editable, draft-only void WITH reason) -> **Submit posts directly OR through the `ar-deposit` workflow purpose** (a deposit demand is a billing act like an invoice, so it can require approval; `pending-approval` while in flight, approval posts via `postDraftDeposit` in the completing tx, rejection/recall returns to draft; new `Deposit.workflowInstanceId` + posting/void audit columns).
- **Posting a deposit is a pure lifecycle flip** - no pool movement, no allocations (deposits are collateral, outside outstanding); it just opens the deposit for collection via Official Receipt.
  Draft deposits are NOT financial: not collectable (the receipt pickers and `collectDepositId` validation filter `status 'open'`), not refundable, not convertible, held 0 so statements are untouched, and reconciliation's identities hold trivially.
- **Both doors unified** (like receipts): the Debtor Account door (`POST /debtors/:id/deposits`) also creates drafts through the shared dialog now - no door can bypass the lifecycle.
- A POSTED deposit keeps the existing collections-free void flip (now also stamping the audit columns when a reason is given); the account screen's Collect / Convert buttons stay gated on posted rows.
- Listing (`GET /deposits`) is shaped like the ledger listings; for deposits the Balance column reads "To collect" (`balanceAmount`) and a second "Held" cell shows the collateral currently held; status 'closed' (fully collected and fully drawn down) displays as Posted.
- Account meta ships `depositApproval` for the Submit button label.
- **The direct Convert door was REMOVED 2026-09-02** (user decision: one door): applying held deposit money to outstanding goes ONLY through the Refund dialog's "Deposit to outstanding" kind - a refund document, a real deposit->refund allocation row, and approval routing.
  The account screen's Convert button, `POST /deposits/:id/convert` and `posting.convertDeposit` are gone.
  HISTORICAL conversion CNs (sourceRef = the deposit's id) remain first-class: their reversal void still restores the deposit's held balance, reconciliation still counts them (`conversionByDeposit`), and the trail viewer below still lists them.
- **Full deposit usage trail in the Allocations viewer (2026-09-02):** for `type=deposit` the drill-down follows the money one hop further than the direct allocation web.
  Each deposit->refund draw carries the refund's OFFSET Credit Note (found by `sourceRef` = the refund's id) and the documents it settled (`onwardVia` + `onward[]` on the allocation row); direct conversions (Convert-button DEPCONV CNs, `sourceRef` = the deposit's id, no allocation row) ship as a separate `conversions[]` array with their settlements and any still-unapplied CN credit.
  The viewer nests the hops under their draw with an indented guide line, so "collected 5000 / offset 2000" reads end to end: OR in, refund out via CN, down to each settled invoice.

## Debit Note slice (2026-09-01 - sixth and last transaction screen)

- `/ar/debit-notes` menu/screen (same `ar-transactions` component + the shared ledger dialog - a DN is billing shaped exactly like an invoice, so the slice is pure generalization: a third `LIFECYCLE_KINDS` entry drives the create/edit/submit/void/list factories and the `ar-debit-note` workflow purpose (registered alongside ar-invoice/ar-credit-note; approval posts, rejection returns to Open).
- **The old immediate posting is GONE from both doors**: the account door (`postLedger`) routes DN through `createDraft` like the other lifecycle kinds, and the shared dialog's Post footer is dead code (every ledger kind shows Save / Submit now).
- **A posted DN is immutable** (the invoice rule extended: debit documents are corrected with a Credit Note, never voided - `voidLedger` routes DN to the draft-only void with reason). The **Raise Credit Note** kebab therefore appears on posted DN rows too, gated on the CN menu's create grant.
- Tax, fx, analysis dimensions, gapless `ar-debit-note` numbering and the TaxLedger freeze all ride the existing generalized paths - no new columns, no migration.

## Invoice lifecycle (defined 2026-08-13 - Save / Submit / approval)

- User-defined lifecycle for MANUAL invoices: **Save -> `draft`** (screen label "Open": editable by the creator or a superior per data scope, voidable with audit, NOT financial - no balance effect, excluded from statements/aging/interest/allocation/reconciliation) -> **Submit -> posted**, either directly or through the **`ar-invoice` approval chain** (`pending-approval` while in flight; approved posts automatically, rejected/recalled returns to `draft`).
  Internal status vocabulary keeps the engine intact: `draft` | `pending-approval` | `open` | `settled` | `void`, where open/settled = POSTED financially (the engine's open->settled flip still powers allocation); the UI maps draft->"Open", open|settled->"Posted" + a Balance amount (per user: no Settled chip on screen). Existing rows needed NO migration.
- THE GAPLESS RULE (firmed up by the user 2026-08-14, superseding the brief number-at-posting design): the series must never SKIP or DUPLICATE **technically** - the counter advances under a SELECT..FOR UPDATE row lock (concurrent users serialise) and commits/rolls back WITH the record that consumes it (`numberingGenerator.issue` with the business transaction - a failed save rewinds the counter).
  Under that rule drafts DO carry their number from SAVE (issued inside the draft-create tx; `docNo` stays NOT NULL), and a voided draft KEEPS its number - **business** gaps in the live sequence are explained by the void audit trail: `voidedAt` / `voidedBy` / `voidReason` (reason REQUIRED on void, shown on the Void card). Auto-issued numbers are immutable on edit; manual numbers may be corrected while draft. Posting-audit columns: `postedAt`, `postedBy`, `workflowInstanceId`.
- Posted invoices are IMMUTABLE: no void on any door (the account screen's generic void now 400s posted invoices) - correction = raise a Credit Note (kebab action arrives with the CN slice). System producers (fee runs, interest, deposit conversion, void reversals) still post directly via `postLedgerDoc`.
- FIRST WIRED WORKFLOW PRODUCER: submit calls `workflowGateway.startWorkflow('ar-invoice', ...)` inside the submit tx (null = no chain -> post immediately); completion lands in `src/wiring/workflowHandlers.js` - onApproved posts the draft in the completing tx via `arPosting.postDraftLedger` + `numberingGateway.issueNumberForCompany` (req-less), onRejected/onCancelled flip back to `draft`. `GET /debtors/:id/account/meta` ships `invoiceApproval` so the dialog labels its button "Submit for Approval" vs "Submit". Tax is quoted at save with onDate=docDate (schemes are effective-dated - no re-quote at post).
- Endpoints: `PATCH /api/ar/invoices/:id` (edit draft; data-scope checked via `canModifyRecord`), `POST /api/ar/invoices/:id/submit` (any-of gate - the account door submits too), void = drafts only.
- Web: the shared ledger dialog gains edit mode + Save / Submit(-for-Approval) footer for invoices (CN adopted it 2026-08-20, DN 2026-09-01 - every ledger kind is a lifecycle kind now); the listing shows Open/Pending Approval/Posted/Void chips + Balance, Edit visible on in-scope drafts, kebab = Submit (confirm states the concrete outcome) + Void.

## Statements (enhanced 2026-08-06)

- Three screens/menus: `/ar/settings` (AR Specification - the per-company options singleton, same role as Club Specification), `/ar/statement-generation` (runs), and `/ar/statements` (pure listing + viewer + void).
- `ar.Setting` per-company singleton, maintained on AR Specification: `statementCutoffDay` (day D = period defaults prev-month D+1 .. this-month D, clamped; NULL = calendar month) and aging boundaries `aging1..aging6` (user-defined days, contiguous ascending prefix).
  `GET /api/ar/settings` is shared with the Generation screen (`requireAnyMenuAction` - its date auto-fill reads the cutoff); `PUT` is Specification-only.
- `ar.Statement` is PRINT-COMPLETE: party snapshot (billName/billAddress/`debtorNo`/`contactPerson` for corporate receivers), issuer letterhead (`companyName`/`companyAddress` via `serviceContext.getCompanyLetterhead`), `deposit` balance, aging amounts `aging1..aging7` (+`agingBoundaries` snapshot - N boundaries print N+1 buckets), `debtorType` + `debtorCategory` (individual|corporate|nominee|other via `membershipGateway.classifyParties`).
- `ar.StatementDetail` (renamed from StatementLine): docDate-based lines + running `balance`.
- OVERWRITE semantics: `statementMonth` is the key; regenerating a debtor's month deletes the old statement + details and recreates them (partial unique index, void rows exempt).
- `ar.StatementRun`: BACKGROUND generation jobs (2026-08-08) - the run row itself is the task queue (status `queued` = pending work) and the OUTBOX WORKER drives it in time-boxed slices (`processActiveRuns`, ~20 debtors per chunk, one tx per debtor, `leaseUntil` claim so overlapping drains never double-process, kick-and-detach self-ping continuation + the 5-min sweep as guarantee).
  The screen polls `GET /statement-runs/:id` for the live percentage, Cancel settles at the next chunk boundary (`cancelling` -> `cancelled`), failed/partial runs `POST /:id/resume` exactly at `processedCount`, and the preview endpoint reports "N in scope, M replaced" before starting.
  Completion alerts the initiator exactly once (`notifiedAt` guard): an in-app notification (header bell, `public.Notification` via `platform/notificationGateway.js`) + a templated email (`ar.statement-run-completed`, tenant-overridable, per-company SMTP).
  Worker env needs `FRONTEND_BASE_URL` (email links) and optionally `OUTBOX_WORKER_URL` + self `run.invoker` (continuous slices without waiting for the sweep).
- Aging is as-of periodEnd: debit open items age by `dueDate` (docDate fallback), allocations counted only when the settling credit document's docDate <= periodEnd. Buckets are PURE debit-item aging (2026-08-11); the unapplied credit side is stored separately as `unallocatedAmount` (signed, printed in brackets) so buckets + unallocated == closing balance. The print adds UNALLOCATED + BALANCE cells after the buckets.
- Print base corrections (2026-08-11, user-marked): letterhead = logo + name + `(companyRegistrationNo)` snapshot + address (title moved below the divider - no collision with long names); right meta block = `Date:` / `From: X to Y` / `Deposit:` (statement number removed from the header, deposit no longer at the bottom); page footer = statement number left, `Page x of y` right.
- PDF (2026-08-11): `GET /api/ar/statements/:id/pdf` renders the Statement of Account with pdfkit from the frozen snapshots only (reprints keep frozen DATA; red VOID marker on voided rows); Download PDF button in the viewer dialog. `arStatementPdf.js` is the seam for emailing statements as attachments. Builtin fonts are Latin-only - bundle a Unicode TTF before CJK party names go live.
- Statement layout Level 1 (2026-08-11): per-company `ar.Setting.statement*` options brand and trim the ONE standard layout - club logo (Company.logo via the letterhead seam), `statementBrandColor` accent (band fills + title; label text flips white/dark by luminance), show/hide toggles (aging strip, deposit, incurred-by, generated note), `statementFooterText` remittance advice. Maintained on AR Specification with a saved-options sample preview (`GET /api/ar/settings/statement-preview`). Layout is PRESENTATION resolved at render time; the snapshot data stays frozen. Level 2 (structural layout-as-data, EmailTemplate-style override) is designed but deliberately not built; per-company code forks are forbidden.

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
- **Step 1 (built):** `ar.Setting.multiCurrencyEnabled` gate (same pattern as Club Spec's `creditFacilityEnabled`: off = no currency controls anywhere) + `fxGainTransactionTypeId` / `fxLossTransactionTypeId` (Forex-class designations; gain/loss is GL-facing, never a debtor document); the **Multi-currency** card on AR Specification (prerequisite readout, toggle disabled without a base currency, the two pickers).
  NEW `ar.ExchangeRate` (`companyId`, `currencyCode` alpha-3, `effectiveDate`, `rate` DECIMAL(21,10), stamps; UNIQUE company+currency+date): 1 unit of the foreign currency = `rate` units of base; lookup = latest `effectiveDate <= docDate`.
  Documents will SNAPSHOT the rate they used, so editing/deleting a rate only changes future defaults - that is why delete is allowed.
  Screen `/ar/exchange-rates` (its own menu; standard listing: search, card per rate with a Current/Upcoming chip, drawer dialog with a live "1 USD = 4.7100 MYR" preview, kebab Delete with confirm, scroll-return); API `GET /exchange-rates/meta` (base + subscriber's foreign currencies + gate), `GET/POST /exchange-rates`, `PUT/DELETE /exchange-rates/:id`, every part Zod-validated, currency must be in the subscriber set and not the base.
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
  Screens: the ledger and receipt dialogs + the account page's refund and deposit forms show an **Exchange rate** field on foreign accounts only (typed decimal, never a spin control; defaults from the rate table at the document date until keyed; a live "≈ base" readout), and the debtor band carries a "USD account" chip. Shared helpers in `web/shared/ar-fx.ts`.
- **Step 4 (built 2026-08-26):** `Allocation.fxGainLoss` DECIMAL(21,2) + `Allocation.fxTransactionTypeId` - the REALIZED exchange difference of every allocation, computed inside `applyAllocation`:
  `fxGainLoss = amount x (credit doc rate - debit doc rate)` in base cents (`allocationFxCents`, same integer-cents rounding as the documents' base equivalents; positive = gain).
  Both rates are frozen on the documents, so the delta per pair never changes: upserts accumulate `fxGainLoss` with `amount`, and the sign never flips.
  A nonzero difference is classified under the AR Specification Forex designations (`resolveFxDesignation`: gain -> `fxGainTransactionTypeId`, loss -> `fxLossTransactionTypeId`); an unset designation makes the posting refuse with the fix named - explicit configuration, never inferred.
  `applyAllocation` also asserts both documents carry the SAME currency (always true by the account-currency design; a mismatch means drift and 409s to Reconcile).
  Reconciliation asserts `fxGainLoss` against the two documents' frozen rates per allocation row (fix mode repairs); a NULL (pre-column row) is STAMPED additively every run like the display snapshots (`fxStamped` in the checked counts), and an allocation whose documents no longer resolve is reported as unresolvable.
  The allocation drill-down (`GET /documents/:type/:id/allocations`) ships the new columns automatically (raw rows).
- **Step 5 (built 2026-08-26):** currency snapshots + display polish, closing the design.
  `Statement.currencyCode` and `Interest.currencyCode` snapshot the account currency at generation - **foreign accounts only, NULL = base** - so single-currency companies see zero change and no backfill is needed.
  The statement viewer and PDF print a "Currency" meta line on foreign statements; the interest run's flash and the review screen's Post button report totals **per currency, never summed across units** (`generateInterest` returns `totals: [{currencyCode, amount}]`); listing rows (statements, interest headers, and the invoice/CN/receipt transaction screens via a top-level `baseCurrencyCode`) carry a brand-tinted currency chip when foreign.
  The allocations drill-down became a real viewer: `GET /documents/:type/:id/allocations` resolves counterpart document numbers and the Forex designation names server-side, and the transaction screens' posted-row kebab gained **Allocations** - a centered viewer listing "Settled by / Applied to <doc> <amount>" per allocation with its realized exchange gain/loss line (`fxGainLoss` + designation) when nonzero.
  Out of scope by decision: per-document currency on one account, month-end revaluation (a later report over base equivalents), Membership fee currencies.

## Not built yet

Frontend producers wiring `authorizeCharge`/`postCharge` from Golf/POS/Facility, statement EMAIL delivery (PDF renderer is ready as the attachment seam), and the conversions phase of the membership CRM.
