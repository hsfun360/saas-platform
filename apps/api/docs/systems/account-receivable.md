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

## Built so far

- Slice 1 - masters: `Debtor`, `OtherDebtor` (AR-owned city-ledger party master), `CreditAccount`, `CreditMemberLimit`.
  Provisioning: membership/nominee activation (create, status change, import migration) enqueues `DebtorProvisionRequested` through the gateway; the outbox worker calls `debtorProvisioning.service` (idempotent find-or-create; existing debtors never overwritten). Backfill: `POST /api/membership/debtor-backfill`.
  Provisioning notifications (2026-08-09): interactive saves stamp `requestedBy` (the caller's userId) + `sourceNo` onto the event; the worker bells that user via `notificationGateway.notifyUser` when the account actually OPENS (`created` true - replays/re-activations stay silent, linkRoute to the debtor detail) and when the event goes terminally FAILED after 5 attempts (retries stay quiet).
  Bulk paths (import migration, backfill) deliberately omit `requestedBy` - their screens already report results, and a 500-row import must not ring the bell 500 times.
  Screens/API: shared Debtor Listing (one list for all three types, party search through the membership seam), ledger-account maintenance, Other Debtor CRUD (party + ledger account in one tx; numbering purpose `ar-other-debtor`).
- Slice 2 - document ledger: `Ledger` (Invoice/DN/CN with debit/credit mode; invoice void = new credit-mode row + auto-allocation), `Receipt` (receipt/refund), `Deposit` (collateral, converted to CN via the DEPCONV process), `Allocation` (validated pairs), `arPosting.service` (integer cents, pool-lock-first, materialized counters), debtor-account screen with entry/void dialogs.
- Slice 3 - periodic: staged interest run (holding header/detail per debtor-month -> review -> selective confirm posts the INTEREST Debit Note) and statements (below).
- Slice 4 - fee runs (membership side producers) and the nightly reconciliation sweep (`arReconciliation.service`, invariant checks + `?fix=1`).
- Numbering Control: AR owns `ar.NumberingScheme` (purposes `ar-*`), screen `/ar/numbering`.

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
- Aging is as-of periodEnd: debit open items age by `dueDate` (docDate fallback), allocations counted only when the settling credit document's docDate <= periodEnd, and the unapplied credit side lands in the first bucket so buckets always sum to the closing balance.
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

## Not built yet

Frontend producers wiring `authorizeCharge`/`postCharge` from Golf/POS/Facility, statement EMAIL delivery (PDF renderer is ready as the attachment seam), and the conversions phase of the membership CRM.
