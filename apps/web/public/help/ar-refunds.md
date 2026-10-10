# Refunds

> **Where:** Account Receivable → Refunds
>
> **Who can use it:** users whose role includes the Account Receivable module and holds this menu.
> The Create, Edit and Delete permissions granted on the menu decide which buttons you see: without Create there is no **New Refund** button and no **Submit**, and without Edit there is no **Edit** or **Void**.

## What this option is for

The Refunds screen handles money going back to a debtor, and the one case where a held deposit is used to clear what the debtor owes.
There are three kinds of refund:

- **Deposit refund** - pays a deposit's held balance back to the debtor through the bank or cash.
- **Excess payment refund** - pays back unallocated receipt credit, oldest first, through the bank or cash.
- **Deposit to outstanding** - applies a deposit's held balance to open items through a Credit Note; no money leaves the bank.

A refund is keyed as an Open draft, then submitted.
Because the first two kinds move money out, submitting may route the refund through an approval chain when your company has one; it posts automatically once approved.
A posted refund is never voided: the money has already left, so bring it back with a new Official Receipt.

## The screen at a glance

[Screenshot: Refunds list with the search box, date range, status filter and refund cards]

- A search box filters by refund number or description as you type.
- Two date fields limit the list to refunds dated in a window.
  The window starts as the current month; picking a From date snaps the To date to the last day of that month, the To date can never be earlier than the From date, and **All dates** clears both.
- A status filter offers **All statuses**, **Open**, **Pending Approval**, **Posted** and **Void**.
- Each refund is a card: the refund number and the debtor's name; a sub-line with the account number, a currency chip on a foreign-currency account, the description, and the void reason on a voided refund; then Date, Amount and, once posted, Balance.
- The status chip sits top-right: **Open**, **Pending Approval**, **Posted** or **Void**.
- An Open refund within your data scope shows **Edit** and a ⋮ menu holding **Submit** and **Void**.
- A posted refund shows a ⋮ menu holding **Allocations**.
- **Load more** appears at the bottom when more refunds match than are shown.
- **New Refund** sits bottom-right.

## Common tasks

### Pay a deposit back

[Screenshot: New Refund dialog at the "what is being refunded" step]

1. Click **New Refund**.
2. Find the debtor: type part of the account number, name or code and click the row.
3. Choose **Deposit refund**.
   Each kind states its consequence before you pick it.
4. The form opens with **Refund of** showing the kind you chose.
   **Change** lets you re-pick while the form is still untouched.

[Screenshot: New Refund dialog entry form for a deposit refund]

5. Check **Refund no.**.
   With automatic numbering it reads "Issued on save"; with manual numbering you must key it.
6. Confirm the **Document date** and **Transaction date (period)**.
7. Pick the deposit in **From deposit**.
   Only posted deposits with a held balance are offered, each labelled with the amount held.
8. Enter the **Amount**, up to the deposit's held balance.
9. Pick the **Payment method** (a Refund-class entry such as `BANKOUT`) and add the **Payment reference**.
10. On a foreign-currency account, check the **Exchange rate**.
11. Add a **Description** if useful.
12. Click **Save** to keep an Open draft, or **Post refund** / **Submit for Approval**.

### Pay back an overpayment

Follow the same steps and choose **Excess payment refund**.
There is no deposit to pick: the amount is funded from the debtor's unallocated receipt credit, oldest first, and cannot exceed what is available.
A payment method and reference are required because money leaves the bank.

### Apply a deposit to what the debtor owes

Follow the same steps and choose **Deposit to outstanding**.
Pick the deposit in **From deposit** and enter the amount to apply.
No payment method is asked for, because no money moves.
When the refund posts, the system also posts a Credit Note for the same amount under the deposit-conversion entry set in AR Specification, and that credit note settles the debtor's open items oldest first.
The net effect is that the held deposit falls and the outstanding balance falls by the same amount.

### Edit an Open refund

1. Find the refund and click **Edit**.
2. Change what you need.
   The kind cannot be changed on an existing draft; void it and key a new one if the kind is wrong.
3. Click **Save**, or submit it as well.

Only Open refunds can be edited, and only within your role's data scope.
If you leave without saving, the system asks whether to discard your changes or keep editing.

### Submit an Open refund from the list

1. Open the ⋮ menu and click **Submit**.
2. Read the confirmation: it names the refund, the debtor and the amount, and states that the number is issued now and the funding source is settled (a deposit's held balance or unallocated credit), and that the offset kind also posts its Credit Note; or that the refund goes into the approval chain.
3. Click **Post refund** or **Submit for Approval**.

Posting refuses rather than reroutes when the funding no longer covers the amount, for example when the deposit was partly refunded in the meantime.
The message names the shortfall so you can adjust and resubmit.

### Void an Open refund

[Screenshot: Confirm void dialog with the Void reason field]

1. Open the ⋮ menu and click **Void**.
2. Enter the compulsory **Void reason**.
3. Click **Void**.

The number stays consumed and the record remains as Void with your reason for the audit trail.

### See how a posted refund was funded

Open the ⋮ menu and click **Allocations** to see the deposit or receipts that funded it ("Settled by Deposit DEP-000002 500.00"), with any realised exchange gain or loss on a foreign-currency account.
On the Deposits screen, the same viewer follows a "Deposit to outstanding" refund one step further to the invoices its Credit Note settled.

## Field reference

### Debtor picker

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Search debtors** | No | Part of the account number, name or code. | Only active debtor accounts are listed. |

### What is being refunded

| Choice | What it does |
| --- | --- |
| **Deposit refund** | Pays a deposit's held balance back to the debtor (money out via bank or cash). |
| **Excess payment refund** | Pays back unallocated receipt credit, oldest first (money out via bank or cash). |
| **Deposit to outstanding** | Applies a deposit's held balance to open items through a Credit Note; no money leaves the bank. |

### New / Edit Refund

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Refund of** | Yes | The kind chosen in the previous step; shown read-only. | **Change** is available only while the form is untouched and the refund is new. |
| **Refund no.** | Only with manual numbering | The refund number, when your company keys numbers by hand. | Up to 30 characters; must not already be in use. With automatic numbering the number is issued on save and cannot be changed. |
| **Document date** | Yes | The date of the refund. | Defaults to today. |
| **Transaction date (period)** | Yes | The accounting period the refund belongs to. | Defaults to the document date; change only when back-keying into a closed month. |
| **From deposit** | Yes for Deposit refund and Deposit to outstanding | The posted deposit the refund draws on, shown with its held balance. | Only deposits with a held balance are offered. Not shown for Excess payment refund. |
| **Amount** | Yes | The amount to refund or apply, for example `500.00`. | Greater than zero; always shown with two decimals. Up to the deposit's held balance, or up to the unallocated credit available. |
| **Payment method** | Yes for Deposit refund and Excess payment refund | How the money goes out, for example `BANKOUT - Bank transfer`. | Refund-class, active entries of the Transaction Type master only. Not shown for Deposit to outstanding. |
| **Payment reference** | No | The cheque number, bank reference or slip number. | Up to 100 characters. Not shown for Deposit to outstanding. |
| **Exchange rate** | Yes, on a foreign-currency account | Base-currency units per unit of the account currency at payout. | A positive decimal with at most 10 decimal places; defaults from Exchange Rates at the document date; frozen once posted. |
| **Description** | No | Free text printed on statements. | |

### Confirm void

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Void reason** | Yes | Why the draft is being voided. | Up to 255 characters; kept for audit. |

## Tips & troubleshooting

- **"Pick what is being refunded."**
  The refund kind is missing; start again from **New Refund** and choose a kind.
- **"Select the deposit this refund draws on."** and **"The deposit is not open on this debtor."**
  Deposit-based kinds need a posted deposit with a held balance; pick one from the list.
- **"The held balance of deposit DEP-000002 (300.00) does not cover this refund."** and **"The held balance of deposit DEP-000002 no longer covers this refund."**
  Reduce the amount to what the deposit still holds, then save or submit again.
- **"Unallocated credit on this account is 80.00 - not enough to fund this refund."** and **"Not enough unallocated credit to fund this refund."**
  An excess payment refund can only pay back credit that exists; check the account's unallocated receipts.
- **"Select a payment method." / "This transaction type is not a Refund-class payment method."**
  Bank-facing refunds need an active Refund-class entry.
  If none exist, the dialog says so under the field: create payout methods such as `BANKOUT` on the Transaction Type master.
- **"A deposit-to-outstanding refund moves no money - it carries no payment method."**
  Clear the payment method; the offset kind never uses one.
- **"Refund number is required (numbering is manual)."** and **"Refund number 'X' is already in use."**
  Key a number not used before.
- **"A posted refund cannot be voided - the money already left; bring it back with a new Official Receipt."**
  Record a receipt for the money that comes back instead.
- **"This refund is awaiting approval - it must be approved or rejected first."**
  Wait for the approver's decision before editing or voiding.
- **"This refund belongs to another user (outside your data scope)."**
  Your role's data scope only lets you amend your own or your department's refunds.
- The Credit Note posted by a "Deposit to outstanding" refund is listed on the Credit Notes screen with a source chip; it cannot be voided on its own, so correct a mistaken offset with a Debit Note.

## Related options

- **Account Receivable → Deposits** - the deposits a refund draws on.
- **Account Receivable → Official Receipts** - the receipt credit an excess payment refund pays back, and the way money is brought back after a wrong refund.
- **Account Receivable → Credit Notes** - where the offset credit note of a "Deposit to outstanding" refund appears.
- **Account Receivable → Transaction Type** - the Refund-class payout methods.
- **Account Receivable → AR Specification** - the deposit-conversion entry the offset credit note posts under, and the Forex entry for exchange differences.
- **Account Receivable → Debtors** - the account page, where refunds can also be keyed with the debtor preset.
