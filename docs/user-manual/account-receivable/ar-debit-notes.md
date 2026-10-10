# Debit Notes

> **Where:** Account Receivable → Debit Notes
>
> **Who can use it:** users whose role includes the Account Receivable module and holds this menu.
> The Create, Edit and Delete permissions granted on the menu decide which buttons you see: without Create there is no **New Debit Note** button and no **Submit**, and without Edit there is no **Edit** or **Void**.

## What this option is for

A debit note charges a debtor more: a surcharge, a correction upward, or any adjustment that increases what the account owes.
It is shaped exactly like an invoice and follows the same life: keyed as an Open draft, submitted for posting (directly or through an approval chain), then settled by receipts or credit notes.

A posted debit note is never edited or voided.
If it is wrong, raise a Credit Note against it.

## The screen at a glance

[Screenshot: Debit Notes list with the search box, date range, status filter and document cards]

- A search box filters by document number or description as you type.
- Two date fields limit the list to debit notes dated in a window.
  The window starts as the current month; picking a From date snaps the To date to the last day of that month, the To date can never be earlier than the From date, and **All dates** clears both.
- A status filter offers **All statuses**, **Open**, **Pending Approval**, **Posted** and **Void**.
- Each debit note is a card: the document number and the debtor's name as the title; a sub-line with the debtor's account number, a currency chip on a foreign-currency account, the description, and the void reason on a voided note; then Date, Amount, Balance (posted notes only) and Due.
- The status chip sits top-right: **Open**, **Pending Approval**, **Posted** or **Void**.
- An Open debit note within your data scope shows **Edit** and a ⋮ menu holding **Submit** and **Void**.
- A posted debit note shows a ⋮ menu holding **Allocations** and, when your role may create credit notes, **Raise Credit Note**.
- **Load more** appears at the bottom when more notes match than are shown.
- **New Debit Note** sits bottom-right.

## Common tasks

### Raise a new debit note

[Screenshot: New Debit Note dialog at the debtor picker step]

1. Click **New Debit Note**.
2. Find the debtor: type part of the account number, name or code and click the row.
   Only active debtor accounts are offered.
3. The form opens with the debtor shown in a band at the top; click **Change** if you picked the wrong one.

[Screenshot: New Debit Note dialog entry form]

4. Check **Debit Note no.**.
   With automatic numbering it reads "Issued on save"; with manual numbering you must key it.
5. Pick the **Transaction type**.
   Only Debit Note-class items from the Transaction Type master are offered, and the item's tax scheme decides the tax added on top.
6. Confirm the **Document date** and **Transaction date (period)**; both default to today.
7. Enter the **Amount** before tax.
8. On a foreign-currency account, check the **Exchange rate**.
9. Add a **Description** if useful.
10. If the Analysis Dimensions section appears, pick a value for each dimension that matters; starred dimensions are compulsory.
11. Click **Save** to keep an Open draft, or **Post debit note** / **Submit for Approval** to make it financial.

The button label tells you what Submit will do: **Post debit note** posts immediately, while **Submit for Approval** sends it into the approval chain and it posts automatically once approved.
If the submit step fails after the save, the note stays saved as Open and the dialog stays open for a retry.

### Edit an Open debit note

1. Find the note and click **Edit**.
2. Change what you need.
   An automatically issued number cannot be changed; a manually keyed number can be corrected while the note is still Open.
3. Click **Save**, or submit it as well.

Only Open notes can be edited, and only within your role's data scope.
If you leave without saving, the system asks whether to discard your changes or keep editing.

### Submit an Open debit note from the list

1. Open the ⋮ menu and click **Submit**.
2. Read the confirmation: it names the note, the debtor and the amount, and states that the number is issued now and the amount increases the debtor's balance, or that the note goes into the approval chain.
3. Click **Post debit note** or **Submit for Approval**.

### Void an Open debit note

[Screenshot: Confirm void dialog with the Void reason field]

1. Open the ⋮ menu and click **Void**.
2. Enter the compulsory **Void reason**.
3. Click **Void**.

The number stays consumed and the record remains as Void with your reason for the audit trail.
A posted debit note cannot be voided; correct it with a Credit Note.

### Raise a Credit Note against a posted debit note

1. Open the ⋮ menu on a posted debit note and click **Raise Credit Note**.
2. The Credit Note dialog opens with the debtor preset, the debit note locked as the document to apply against, the amount seeded with its remaining balance and its analysis dimensions copied.
3. Adjust the amount if needed, then save or submit.

This action appears only when your role may create credit notes, and it is refused when the note is already fully allocated.

### See how a posted debit note was settled

Open the ⋮ menu and click **Allocations** to list each receipt or credit note that settled it, with any realised exchange gain or loss on a foreign-currency account.

## Field reference

### Debtor picker

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Search debtors** | No | Part of the account number, name or code. | Only active debtor accounts are listed. |

### New / Edit Debit Note

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Debit Note no.** | Only with manual numbering | The number, when your company keys numbers by hand. | Up to 30 characters; must not already be in use. With automatic numbering the number is issued on save and cannot be changed. |
| **Transaction type** | Yes | The adjustment item, for example `SURCH - Late registration surcharge`. | Debit Note-class, active items only. |
| **Document date** | Yes | The date the note is raised. Drives the due date and aging. | Defaults to today. |
| **Transaction date (period)** | Yes | The accounting period the note belongs to. | Defaults to the document date; change only when back-keying into a closed month. |
| **Amount** | Yes | The amount before tax, for example `50.00`. | Greater than zero; always shown with two decimals. |
| **Exchange rate** | Yes, on a foreign-currency account | Base-currency units per unit of the account currency. | A positive decimal with at most 10 decimal places; defaults from Exchange Rates at the document date; frozen once posted. |
| **Description** | No | Free text printed on statements. | |
| **Analysis Dimensions** (one picker per dimension) | Yes for starred dimensions | The reporting value for each dimension. | Values come from Analysis Setup; a child's choices narrow to the chosen parent. |

### Confirm void

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Void reason** | Yes | Why the draft is being voided. | Up to 255 characters; kept for audit. |

## Tips & troubleshooting

- **"Amount must be greater than zero."**
  Enter a positive amount.
- **"Select a transaction type." / "This transaction type is not a Debit Note-class item."**
  Pick an active Debit Note-class item; Invoice-class items are not offered here.
- **"Debit Note number is required (numbering is manual)."** and **"Debit Note number 'X' is already in use."**
  Key a number, and make it one not used before.
- **"No USD exchange rate is effective on the document date - add one under Exchange Rates or key the rate on the document."**
  Add a rate under Exchange Rates or type one in the dialog.
- **"Credit limit exceeded for this debtor."**
  Posting would take the account past its credit limit; the note stays Open until the limit changes or the account is paid down.
- **"A posted debit note cannot be voided - raise a Credit Note to offset it."**
  Posted debit documents are corrected with a Credit Note, never voided.
- **"This debit note is awaiting approval - it must be approved or rejected first."**
  Wait for the approver's decision.
- **"This debit note belongs to another user (outside your data scope)."**
  Your role's data scope only lets you amend your own or your department's documents.
- **"A void reason is required (kept for audit)."**
  Fill in the reason before clicking Void.

## Related options

- **Account Receivable → Invoices** - the main billing document; a debit note is its upward correction.
- **Account Receivable → Credit Notes** - the downward correction, and the way to reverse a posted debit note.
- **Account Receivable → Debtors** - the account-first view where debit notes can also be keyed.
- **Account Receivable → Transaction Type** - the Debit Note-class items and their tax schemes.
- **Account Receivable → Numbering Control** - automatic or manual debit note numbering.
