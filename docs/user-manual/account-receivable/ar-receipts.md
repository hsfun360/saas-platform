# Official Receipts

> **Where:** Account Receivable → Official Receipts
>
> **Who can use it:** users whose role includes the Account Receivable module and holds this menu.
> The Create, Edit and Delete permissions granted on the menu decide which buttons you see: without Create there is no **New Official Receipt** button and no **Submit**, and without Edit there is no **Edit** or **Void**.

## What this option is for

The Official Receipts screen records money coming in from debtors.
A receipt is keyed as an Open draft, then posted; posting reduces the debtor's balance and settles their open invoices and debit notes oldest first.
If the receipt is larger than what is open, the excess stays on the account as unallocated credit.

A receipt can also pay in a security deposit that was billed earlier: the deposit is paid first and the remainder settles open items.
Receipts never go through an approval chain; posting is immediate.

## The screen at a glance

[Screenshot: Official Receipts list with the search box, date range, status filter and receipt cards]

- A search box filters by receipt number or description as you type.
- Two date fields limit the list to receipts dated in a window.
  The window starts as the current month; picking a From date snaps the To date to the last day of that month, the To date can never be earlier than the From date, and **All dates** clears both.
- A status filter offers **All statuses**, **Open**, **Posted** and **Void**.
- Each receipt is a card: the receipt number and the debtor's name; a sub-line with the account number, a currency chip on a foreign-currency account, the description, and the void reason on a voided receipt; then Date, Amount and, once posted, Balance (the credit not yet allocated to any document).
- The status chip sits top-right: **Open** (an editable draft that has not touched the account), **Posted** or **Void**.
- An Open receipt within your data scope shows **Edit** and a ⋮ menu holding **Submit** and **Void**.
- A posted receipt shows a ⋮ menu holding **Allocations**.
- **Load more** appears at the bottom when more receipts match than are shown.
- **New Official Receipt** sits bottom-right.

## Common tasks

### Record a payment

[Screenshot: New Official Receipt dialog at the debtor picker step]

1. Click **New Official Receipt**.
2. Find the debtor: type part of the account number, name or code and click the row.
   Each row shows the current outstanding amount, so you can check it against the payment.
3. The form opens with the debtor shown in a band at the top; click **Change** if you picked the wrong one.

[Screenshot: New Official Receipt dialog entry form]

4. Check **Receipt no.**.
   With automatic numbering it reads "Issued on save"; with manual numbering you must key it.
5. Pick the **Payment method**, for example `CASH` or `CHQ`.
   The choices are the Receipt-class entries of the Transaction Type master; if the list is empty, create them there first.
6. Confirm the **Document date** (the day the money was received) and **Transaction date (period)**.
7. Enter the **Amount** received.
8. Add the **Payment reference**: the cheque number, bank reference or slip number.
9. On a foreign-currency account, check the **Exchange rate** on the day of collection; the approximate base-currency amount collected shows underneath.
10. If the debtor has a billed deposit still to be collected, a **Collect deposit** field appears.
    Pick the deposit to pay it in first; whatever remains settles open items oldest first.
11. Add a **Description** if useful.
12. Click **Save** to keep the receipt as an Open draft, or **Post receipt** to post it now.

Posting issues the number if it was not issued already, reduces the debtor's balance and settles open items oldest first.
If the posting step fails after the save, the receipt stays saved as Open and the dialog stays open so you can fix and retry.

### Collect a deposit

Deposits are billed on the Deposits screen and collected here.
Either pick the deposit in **Collect deposit** while keying the receipt, or start from the debtor's account page, where the deposit row's **Collect** button opens this dialog with the deposit pre-selected.
Only posted deposits with an amount still to collect are offered.

### Edit an Open receipt

1. Find the receipt (set the status filter to **Open** if needed) and click **Edit**.
2. Change what you need.
   An automatically issued number cannot be changed; a manually keyed number can be corrected while the receipt is Open.
3. Click **Save**, or **Post receipt**.

Only Open receipts can be edited, and only within your role's data scope.
If you leave without saving, the system asks whether to discard your changes or keep editing.

### Post an Open receipt from the list

1. Open the ⋮ menu and click **Submit**.
2. Read the confirmation: it names the receipt, the debtor and the amount, and states that the number is issued now, the money reduces the debtor's balance and settles open items oldest first.
3. Click **Post official receipt**.

### Void an Open receipt

[Screenshot: Confirm void dialog with the Void reason field]

1. Open the ⋮ menu and click **Void**.
2. Enter the compulsory **Void reason**.
3. Click **Void**.

The draft never posted, so nothing reverses; the number stays consumed and the record remains as Void with your reason for the audit trail.
A posted receipt can only be voided from the debtor's account page, and only while none of its money has been allocated.

### See what a posted receipt settled

Open the ⋮ menu and click **Allocations**.
The viewer lists each document the money went to ("Applied to Invoice INV-000031 150.00", or a deposit it collected), with the realised exchange gain or loss per line on a foreign-currency account.

## Field reference

### Debtor picker

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Search debtors** | No | Part of the account number, name or code. | Only active debtor accounts are listed. |

### New / Edit Official Receipt

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Receipt no.** | Only with manual numbering | The receipt number, when your company keys numbers by hand. | Up to 30 characters; must not already be in use. With automatic numbering the number is issued on save and cannot be changed. |
| **Payment method** | Yes | How the money arrived, for example `CASH - Cash` or `CHQ - Cheque`. | Receipt-class, active entries of the Transaction Type master only. |
| **Document date** | Yes | The day the payment was received. | Defaults to today. |
| **Transaction date (period)** | Yes | The accounting period the receipt belongs to. | Defaults to the document date; change only when back-keying into a closed month. |
| **Amount** | Yes | The amount received, for example `500.00`. | Greater than zero; always shown with two decimals. |
| **Payment reference** | No | The cheque number, bank reference or slip number. | Up to 100 characters. |
| **Exchange rate** | Yes, on a foreign-currency account | Base-currency units per unit of the account currency on the day of collection. | A positive decimal with at most 10 decimal places; defaults from Exchange Rates at the document date; frozen once posted. |
| **Collect deposit** | No | The billed deposit this payment pays in first, shown as the deposit number and the amount still to collect. | Only shown when the debtor has a posted deposit with an amount to collect. |
| **Description** | No | Free text printed on statements. | |

### Confirm void

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Void reason** | Yes | Why the draft is being voided. | Up to 255 characters; kept for audit. |

## Tips & troubleshooting

- **"Select a payment method." / "This transaction type is not a Receipt-class payment method."**
  Pick an active Receipt-class entry.
  If none exist, the dialog says so under the field: create payment methods such as `CASH` on the Transaction Type master.
- **"Receipt number is required (numbering is manual)."** and **"Receipt number 'X' is already in use."**
  Key a number not used before.
- **"The deposit is not open on this debtor."** and **"The deposit is already fully collected."**
  The deposit chosen in Collect deposit is no longer collectable; clear the field or pick another.
- **"No USD exchange rate is effective on the document date - add one under Exchange Rates or key the rate on the document."**
  Add a rate under Exchange Rates or type one in the dialog.
- **"This allocation realizes an exchange difference - designate a Forex Transaction Type in AR Specification first."**
  A foreign-currency receipt settling a document at a different rate produces a gain or loss; set the Forex entry under AR Specification, then post again.
- **"Only an Open (draft) receipt can be edited (this one is open)."**
  A posted receipt cannot be changed; if it is wrong, void it from the debtor's account page (only while unallocated) and key it again.
- **"This receipt has allocations - it can no longer be voided."**
  Its money has already settled documents; raise the correcting documents instead.
- **"This receipt belongs to another user (outside your data scope)."**
  Your role's data scope only lets you amend your own or your department's receipts.
- A receipt larger than the open items leaves unallocated credit on the account; it is shown as the Balance on the card and is used automatically by later postings, or can be paid back through a Refund of kind "Excess payment refund".

## Related options

- **Account Receivable → Deposits** - deposits are billed there and collected here.
- **Account Receivable → Refunds** - pays back excess receipt credit or a held deposit.
- **Account Receivable → Debtors** - the account page, where receipts can also be keyed with the debtor preset and posted receipts are voided.
- **Account Receivable → Transaction Type** - the Receipt-class payment methods.
- **Account Receivable → Numbering Control** - automatic or manual receipt numbering.
