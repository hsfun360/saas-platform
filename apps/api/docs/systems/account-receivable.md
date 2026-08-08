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
- `ar.StatementRun`: chunked, resumable generation jobs - the screen drives `POST /statement-runs/:id/process` (~20 debtors per call, one tx per debtor) and renders live percentage/counters; preview endpoint reports "N in scope, M replaced" before starting.
- Aging is as-of periodEnd: debit open items age by `dueDate` (docDate fallback), allocations counted only when the settling credit document's docDate <= periodEnd, and the unapplied credit side lands in the first bucket so buckets always sum to the closing balance.

## Not built yet

Frontend producers wiring `authorizeCharge`/`postCharge` from Golf/POS/Facility, statement PDF/email delivery, and the conversions phase of the membership CRM.
