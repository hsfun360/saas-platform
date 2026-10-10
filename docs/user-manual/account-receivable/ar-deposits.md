# Deposits

> **Where:** Account Receivable → Deposits
>
> **Who can use it:** users whose role includes the Account Receivable module and holds this menu.
> The Create, Edit and Delete permissions granted on the menu decide which buttons you see: without Create there is no **New Deposit** button and no **Submit**, and without Edit there is no **Edit** or **Void**.

## What this option is for

The Deposits screen bills security deposits: the collateral a debtor must lodge with the club.
Opening a deposit is a billing act, so the form only asks for the required amount; the money itself arrives later through an Official Receipt against the posted deposit.

A deposit is keyed as an Open draft, then submitted.
Like an invoice it can require approval; it posts automatically once approved.
Posting never touches the debtor's outstanding balance, because a deposit is collateral, not a charge.
It simply opens the deposit for collection.

Held deposit money is paid back, or applied to what the debtor owes, through the Refunds screen.

## The screen at a glance

[Screenshot: Deposits list with the search box, date range, status filter and deposit cards]

- A search box filters by deposit number or description as you type.
- Two date fields limit the list to deposits dated in a window.
  The window starts as the current month; picking a From date snaps the To date to the last day of that month, the To date can never be earlier than the From date, and **All dates** clears both.
- A status filter offers **All statuses**, **Open**, **Pending Approval**, **Posted** and **Void**.
- Each deposit is a card: the deposit number and the debtor's name; a sub-line with the account number, a currency chip on a foreign-currency account, the description, and the void reason on a voided deposit; then Date, Amount (the amount required) and, once posted, **To collect** (what has not been paid in yet) and **Held** (the collateral currently held).
- The status chip sits top-right: **Open**, **Pending Approval**, **Posted** or **Void**.
  A deposit that was fully collected and then fully drawn down also shows as Posted.
- An Open deposit within your data scope shows **Edit** and a ⋮ menu holding **Submit** and **Void**.
- A posted deposit shows a ⋮ menu holding **Allocations**.
- **Load more** appears at the bottom when more deposits match than are shown.
- **New Deposit** sits bottom-right.

## Common tasks

### Bill a deposit

[Screenshot: New Deposit dialog at the debtor picker step]

1. Click **New Deposit**.
2. Find the debtor: type part of the account number, name or code and click the row.
3. The form opens with the debtor shown in a band at the top; click **Change** if you picked the wrong one.

[Screenshot: New Deposit dialog entry form]

4. Check **Deposit no.**.
   With automatic numbering it reads "Issued on save"; with manual numbering you must key it.
5. Enter the **Required amount**.
6. Confirm the **Document date** and **Transaction date (period)**.
7. On a foreign-currency account, check the **Exchange rate**.
8. Add a **Description** if useful.
9. Click **Save** to keep an Open draft, or **Post deposit** / **Submit for Approval**.

The button label tells you what Submit will do: **Post deposit** opens the deposit for collection now, while **Submit for Approval** sends it into the approval chain and it opens automatically once approved.
If the submit step fails after the save, the deposit stays saved as Open and the dialog stays open for a retry.

### Collect a posted deposit

Collection happens on the Official Receipts screen: key a receipt for the debtor and pick the deposit in **Collect deposit**.
On the debtor's account page, the deposit row offers a **Collect** button that opens the receipt dialog with the deposit pre-selected.
The card's **To collect** figure falls with each collection and **Held** rises.

### Edit an Open deposit

1. Find the deposit and click **Edit**.
2. Change what you need.
   An automatically issued number cannot be changed; a manually keyed number can be corrected while the deposit is Open.
3. Click **Save**, or submit it as well.

Only Open deposits can be edited, and only within your role's data scope.
If you leave without saving, the system asks whether to discard your changes or keep editing.

### Submit an Open deposit from the list

1. Open the ⋮ menu and click **Submit**.
2. Read the confirmation: the number is issued now and the deposit opens for collection via Official Receipt, never entering the outstanding balance; or the deposit goes into the approval chain.
3. Click **Post deposit** or **Submit for Approval**.

### Void an Open deposit

[Screenshot: Confirm void dialog with the Void reason field]

1. Open the ⋮ menu and click **Void**.
2. Enter the compulsory **Void reason**.
3. Click **Void**.

The number stays consumed and the record remains as Void with your reason for the audit trail.
A posted deposit can only be voided from the debtor's account page, and only before its first collection.

### Follow a deposit's money

Open the ⋮ menu on a posted deposit and click **Allocations**.
The viewer shows every receipt that collected it ("Settled by Official Receipt OR-000012 500.00") and every refund that drew on it.
For a "Deposit to outstanding" refund it goes one step further: under the draw it lists the Credit Note the refund posted and each invoice that credit note settled, so you can read "collected 5000, applied 2000" end to end.

## Field reference

### Debtor picker

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Search debtors** | No | Part of the account number, name or code. | Only active debtor accounts are listed. |

### New / Edit Deposit

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Deposit no.** | Only with manual numbering | The deposit number, when your company keys numbers by hand. | Up to 30 characters; must not already be in use. With automatic numbering the number is issued on save and cannot be changed. |
| **Required amount** | Yes | The collateral the debtor must lodge, for example `5000.00`. | Greater than zero; always shown with two decimals. |
| **Document date** | Yes | The date the deposit is billed. | Defaults to today. |
| **Transaction date (period)** | Yes | The accounting period the deposit belongs to. | Defaults to the document date; change only when back-keying into a closed month. |
| **Exchange rate** | Yes, on a foreign-currency account | Base-currency units per unit of the account currency. | A positive decimal with at most 10 decimal places; defaults from Exchange Rates at the document date; frozen once posted. |
| **Description** | No | Free text printed on statements, for example `Golf membership security deposit`. | |

### Confirm void

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Void reason** | Yes | Why the draft is being voided. | Up to 255 characters; kept for audit. |

## Tips & troubleshooting

- **"Amount must be greater than zero."**
  Enter a positive required amount.
- **"Deposit number is required (numbering is manual)."** and **"Deposit number 'X' is already in use."**
  Key a number not used before.
- **"No USD exchange rate is effective on the document date - add one under Exchange Rates or key the rate on the document."**
  Add a rate under Exchange Rates or type one in the dialog.
- **"Only an Open (draft) deposit can be edited (this one is open)."**
  A posted deposit cannot be changed; void it from the debtor's account page before any collection and key it again.
- **"This deposit has collections and cannot be voided."**
  Money has already been paid in; pay it back through a Deposit refund instead.
- **"This deposit is awaiting approval - it must be approved or rejected first."**
  Wait for the approver's decision before editing or voiding.
- **"This deposit belongs to another user (outside your data scope)."**
  Your role's data scope only lets you amend your own or your department's deposits.
- An Open deposit is not yet financial: it cannot be collected, refunded or applied, and it does not appear on statements.
- The statement prints the held deposit when "Print the security deposit held" is ticked under AR Specification.

## Related options

- **Account Receivable → Official Receipts** - collects a posted deposit.
- **Account Receivable → Refunds** - pays a held deposit back, or applies it to outstanding through a Credit Note.
- **Account Receivable → Debtors** - the account page, with the deposit's required, collected and held figures and the **Collect** button.
- **Account Receivable → Numbering Control** - automatic or manual deposit numbering.
- **Account Receivable → AR Specification** - whether the held deposit prints on statements.
