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

## Built so far (slice 1)

- Models: `Debtor`, `OtherDebtor` (AR-owned city-ledger party master), `CreditAccount`, `CreditMemberLimit`.
- Provisioning: membership/nominee activation (create, status change, import migration) enqueues `DebtorProvisionRequested` through the gateway; the outbox worker calls `debtorProvisioning.service` (idempotent find-or-create; existing debtors never overwritten). Backfill: `POST /api/membership/debtor-backfill`.
- Screens/API: shared Debtor Listing (`GET /api/ar/debtors` - one list for all three types, party search through the membership seam), ledger-account maintenance (`PATCH /api/ar/debtors/:id`), Other Debtor CRUD (creates party + ledger account in one tx; numbering purpose `ar-other-debtor`).

## Not built yet

Document ledger (`Ledger` Invoice/DN/CN with debit/credit mode, `Receipt`/Refund, `Deposit`, `Allocation`), authorizeCharge credit check, interest generation, statements, fee-generation producers (membership side).
