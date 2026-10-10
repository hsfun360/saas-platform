# Debtor Listing

> **Where:** Account Receivable → Debtor Listing
>
> **Who can use it:** users whose role includes the Account Receivable module and holds this menu.
> The Create, Edit and Delete permissions granted on the menu decide which buttons you see: without Create there is no **New Other Debtor**, **Provision from Membership** or **Reconcile**; without Edit there is no **Edit terms**, **Edit profile**, **Enable** / **Disable** or **Void**.
> The document entry buttons on a debtor's account page follow the Create permission of each document's own menu (Invoices, Official Receipts and so on), not this one.

## What this option is for

The Debtor Listing shows every ledger account in one place: membership contracts, nominees with their own account, and Other Debtors (customers the club bills directly, such as companies hiring the function room).
Finance comes here to see who owes what, to maintain credit terms, and to open an account's page to read its documents or key a new one.

Membership and Nominee accounts open automatically when a membership or nominee becomes active; their names and numbers come from the membership record.
Other Debtors are created and maintained here, because Account Receivable owns their details.

Clicking **Account** on any row opens the debtor's account page: balances at the top, then the three books of the account (documents, receipts and refunds, deposits), with buttons to key new documents and to void.

## The screen at a glance

[Screenshot: Debtor Listing with the type chips, status filter, search, sort and debtor cards]

- A row of chips filters by account type: **All**, **Membership**, **Nominee** and **Other Debtor**.
- A status filter offers **All statuses**, **Active**, **Suspended** and **Closed**.
- When multi-currency is switched on in AR Specification, a currency filter narrows the list to accounts in one currency.
- **Provision from Membership** opens ledger accounts for memberships and nominees that were already active before Account Receivable was switched on.
  It is safe to run more than once; existing accounts are never touched.
- **Reconcile** checks every stored balance against the underlying documents and reports any drift.
- A search box finds accounts by number, name or code as you type, and a sort menu beside it orders by Newest, Number, Name, Outstanding, Credit limit or Terms; clicking the active field again flips the direction.
- Each account is a card: the account number and name as the title; a sub-line with the type chip, the currency chip (tinted when it differs from the base currency), the membership class or the parent membership number for a nominee ("of GOLD26-000001"), and the words "interest" and "reminders" when those options are on; then Terms, Credit limit and Outstanding.
- The status chip sits top-right: **Active** (green) or **Suspended** / **Closed** (grey).
- Every row has **Account** plus a ⋮ menu holding **Edit terms** and, for Other Debtors only, **Edit profile** and **Enable** / **Disable**.
- The footer reads "Showing 25 of 140" with a **Load more** button.
- **New Other Debtor** sits bottom-right.

## Common tasks

### Open an account page

[Screenshot: Debtor account page with the balance tiles, action buttons and the three document sections]

1. Click **Account** on the row.
2. The page header names the account, with **Back to Debtor Listing** underneath.
3. The balance tiles show Currency (when multi-currency is on), Outstanding, Credit limit, Terms, and one "cap" tile per person who has a personal credit limit on this account, reading used / limit.
4. Below the tiles, buttons key new documents for this debtor: **Invoice**, **Debit Note**, **Credit Note**, **Official Receipt**, **Refund** and **Deposit**.
   You only see the buttons for document types your role may create.
5. Three collapsible sections list the account's history:
   - **Documents** - invoices, debit notes, credit notes and interest charges, each with its date, period date when different, due date, source, amount, remaining balance once something has been applied, and a status chip (Open, Pending Approval, Posted or Void).
   - **Receipts & refunds** - money in and out, with the payment method and reference, and the unallocated amount on a posted receipt.
   - **Deposits** - each deposit's required, collected and held amounts, with **Collect** while something remains to be paid in.

### Key a document from the account page

Click the document button.
The same entry dialog as the dedicated transaction screen opens, with the debtor already chosen, so the steps are those described in the Invoices, Debit Notes, Credit Notes, Official Receipts, Refunds and Deposits manuals.
After saving or posting, the page reloads with the new document in its section.

### Void a document from the account page

- **Documents**: an Open invoice, debit note or credit note shows **Void**; enter the reason and confirm.
  A posted credit note that has not been applied yet also shows **Void**; the system posts a reversal against it.
  Posted invoices, debit notes and interest charges never show Void; correct them with a Credit Note.
- **Receipts & refunds**: an Open receipt, or a posted receipt none of whose money has been allocated, shows **Void**.
  Refunds are never voided here.
- **Deposits**: a posted deposit that has not been collected shows **Void** in its ⋮ menu.

The confirmation states what will happen, and Open drafts require a void reason that is kept for audit.

### Edit an account's credit terms

[Screenshot: Edit debtor dialog]

1. Open the row's ⋮ menu and click **Edit terms**.
2. Set **Terms (days)** - how long the debtor has to pay; blank means payment is due immediately.
3. For an Other Debtor, set the **Credit limit**.
   For a Membership or Nominee account the field is read-only, because the Membership department maintains the limit on the membership or member record and it syncs here.
4. Set the **Status**: Active, Suspended (no new postings, account still visible) or Closed (terminal, kept for history).
5. Tick **Send payment reminders** and **Charge late-payment interest** as the club's policy requires.
6. Click **Save**.

If you leave without saving, the system asks whether to discard your changes or keep editing.

### Add an Other Debtor

[Screenshot: New Other Debtor dialog]

1. Click **New Other Debtor**.
2. Enter the **Debtor code** if your company keys codes by hand; with automatic numbering the field reads "Issued automatically".
3. Enter the **Name**.
4. When multi-currency is on, choose the **Account currency**.
   It starts as the base currency.
   Every document on the account will be in this currency, and it locks once the first document is saved, so a customer who needs two currencies gets two Other Debtor accounts.
5. Fill in the identity and contact details: **Registration no.**, **Tax no.**, **Contact person**, **Email**, **Phone**, **Mobile**, the three **Address** lines, **City**, **State**, **Postcode** and **Country**, plus **Remarks**.
6. Under the ledger account heading, set the starting **Terms (days)**, **Credit limit**, **Send payment reminders** and **Charge late-payment interest**.
   These are edited later through **Edit terms**.
7. Click **Save**.

The new account appears in the list as Active and can be picked on every entry screen straight away.

### Edit an Other Debtor's profile

1. Open the row's ⋮ menu and click **Edit profile**.
2. Change the details.
   The debtor code is fixed after creation.
   The account currency is locked once the account has documents; the dialog says so under the field.
3. Click **Save**.

### Disable or enable an Other Debtor

- Open the ⋮ menu and click **Disable** to suspend the account: it stays visible with its history but accepts no new postings and disappears from the debtor pickers.
- Click **Enable** to reactivate it.

A Closed account cannot be toggled.
Membership and Nominee accounts are not disabled here; change their **Status** through **Edit terms** instead.

### Provision accounts for existing memberships

Click **Provision from Membership**.
The system queues the opening of ledger accounts for every active membership and nominee that does not yet have one, and reports how many were queued.
Accounts that already exist are left exactly as they are.

### Reconcile balances

[Screenshot: Reconciliation dialog listing discrepancies]

1. Click **Reconcile**.
2. If every balance agrees with its documents, a message says so and nothing else happens.
3. Otherwise a dialog lists each discrepancy: where it is, which figure, the expected value and the stored value, with a count of the debtors, documents, receipts and deposits checked.
4. If your role may edit, click **Repair N counter(s)** to correct the stored figures to the computed truth; repaired rows are marked.

The same check runs automatically every night in report-only mode.

## Field reference

### Filters and search

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Type chips** | No | All, Membership, Nominee or Other Debtor. | |
| **Status filter** | No | All statuses, Active, Suspended or Closed. | |
| **Currency filter** | No | One account currency, or All currencies. | Shown only when multi-currency is on. |
| **Search debtors** | No | Part of the number, name or code. | |
| **Sort** | No | Newest, Number, Name, Outstanding, Credit limit or Terms, ascending or descending. | |

### Edit debtor (credit terms)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Terms (days)** | No | Days allowed to pay, for example `30`. Blank means immediate. | A whole number from 0 to 3650. |
| **Credit limit** | No | The most the account may owe, for example `5000.00`. | Zero or more; always shown with two decimals. Editable for Other Debtors only; Membership and Nominee limits are maintained in Membership. |
| **Status** | Yes | Active, Suspended or Closed. | |
| **Send payment reminders** | No | Tick to include the account in payment reminders. | |
| **Charge late-payment interest** | No | Tick to have the Interest Generation run consider this account. | |

### New / Edit Other Debtor

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Debtor code** | Yes, when no automatic numbering scheme is active | The account code, for example `OD-0001`. | Up to 30 characters; must be unique in the company; fixed after creation. Issued automatically when the Other Debtor Code numbering scheme is set to auto. |
| **Name** | Yes | The customer's name. | Up to 255 characters. |
| **Account currency** | No | The currency every document on this account will carry. | Shown only when multi-currency is on; starts as the base currency; locked once the account has documents. |
| **Registration no.** | No | The company or identity registration number. | Up to 255 characters. |
| **Tax no.** | No | The customer's tax identification number. | Up to 255 characters. |
| **Contact person** | No | Who to address statements to. | Up to 255 characters; printed as "Attn:" on statements. |
| **Email** | No | The billing email address. | Must be a valid email address. |
| **Phone** / **Mobile** | No | Pick the country code, then type the number. | |
| **Address** (three lines), **City**, **State**, **Postcode**, **Country** | No | The billing address printed on statements. | Postcode up to 20 characters; Country from the active country list. |
| **Remarks** | No | Internal notes. | |
| **Terms (days)** | No | Starting payment terms; blank means immediate. | 0 to 3650; create mode only. |
| **Credit limit** | No | Starting credit limit. | Zero or more; create mode only. |
| **Send payment reminders** / **Charge late-payment interest** | No | Starting reminder and interest settings. | Create mode only. |

## Tips & troubleshooting

- **"Terms must be a number of days (0-3650)."**
  Enter a whole number of days in that range, or leave blank for immediate payment.
- **"Credit limit must be zero or a positive amount."**
  The limit cannot be negative.
- **"This account's credit limit is maintained in Membership - edit it on the membership/member record."**
  Membership and Nominee limits are owned by the Membership department; change the limit there and it syncs here.
- **"Your role's data scope does not allow amending this record."** and **"OD-0001 is outside your data scope and cannot be amended."**
  Your role can only amend records created by you or your department.
- **"Debtor code is required (no auto-numbering scheme is active)."** and **"Debtor code 'X' is already in use."**
  Key a unique code, or set up an automatic Other Debtor Code scheme under Numbering Control.
- **"Name is required."**
  Every Other Debtor needs a name.
- **"Multi-currency is switched off in AR Specification - accounts are opened in the base currency."** and **"USD is not in your subscription's currency set (Account Currencies)."**
  Switch multi-currency on, and make sure the currency is part of your subscription's currency set, before opening a foreign-currency account.
- **"The OD-0001 account already has documents in USD - its currency can no longer change. Open a separate Other Debtor for MYR."**
  An account's currency is fixed once it has documents.
- **"This document has allocations - correct it with a Credit Note instead of voiding."**, **"This receipt has allocations - it can no longer be voided."** and **"This deposit has collections and cannot be voided."**
  Once money has been applied, voiding is no longer possible; use the correcting documents.
- **"These documents disagree on currency - run Reconcile; allocation across currencies is never valid."**
  Something is inconsistent on the account; run **Reconcile** and review the report.
- Suspend rather than close an account you may need again; Closed is terminal.

## Related options

- **Account Receivable → Invoices**, **Debit Notes**, **Credit Notes**, **Official Receipts**, **Refunds** and **Deposits** - the dedicated screens for each document type keyed from the account page.
- **Account Receivable → Interest Generation** - charges interest only on accounts with "Charge late-payment interest" ticked.
- **Account Receivable → Statement Generation** - statements are produced per debtor account.
- **Account Receivable → AR Specification** - the multi-currency switch that reveals the currency controls.
- **Account Receivable → Numbering Control** - the Other Debtor Code series.
- **Membership Management → Memberships** and **Members** - where Membership and Nominee accounts originate, and where their credit limits are maintained.
