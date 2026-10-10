# Credit Notes

> **Where:** Account Receivable → Credit Notes
>
> **Who can use it:** users whose role includes the Account Receivable module and holds this menu.
> The Create, Edit and Delete permissions granted on the menu decide which buttons you see: without Create there is no **New Credit Note** button and no **Submit**, and without Edit there is no **Edit** or **Void**.

## What this option is for

A credit note reduces what a debtor owes.
It is the one correction document for posted invoices and debit notes, which are never edited or voided, and it can also stand alone as available credit on the account.

When you raise a credit note you decide what it applies against: a specific open invoice or debit note, or nothing, in which case the amount stays on the account as credit until a later document uses it.
A credit note follows the same life as an invoice: Open draft, submitted for posting (directly or through an approval chain), then applied.

## The screen at a glance

[Screenshot: Credit Notes list with the search box, date range, status filter and document cards]

- A search box filters by document number or description as you type.
- Two date fields limit the list to credit notes dated in a window.
  The window starts as the current month; picking a From date snaps the To date to the last day of that month, the To date can never be earlier than the From date, and **All dates** clears both.
- A status filter offers **All statuses**, **Open**, **Pending Approval**, **Posted** and **Void**.
- Each credit note is a card: the document number and the debtor's name; a sub-line with the account number, a currency chip on a foreign-currency account, a source chip when the note was produced by the system (for example a deposit conversion), the description, and the void reason on a voided note; then Date, Amount and, once posted, Balance (the credit not yet applied).
- The status chip sits top-right: **Open**, **Pending Approval**, **Posted** or **Void**.
- An Open credit note within your data scope shows **Edit** and a ⋮ menu holding **Submit** and **Void**.
- A posted credit note shows a ⋮ menu holding **Allocations**.
- **Load more** appears at the bottom when more notes match than are shown.
- **New Credit Note** sits bottom-right.

## Common tasks

### Raise a new credit note

[Screenshot: New Credit Note dialog at the debtor picker step]

1. Click **New Credit Note**.
2. Find the debtor: type part of the account number, name or code and click the row.
3. The form opens with the debtor shown in a band at the top; click **Change** if you picked the wrong one.

[Screenshot: New Credit Note dialog entry form]

4. Check **Credit Note no.**.
   With automatic numbering it reads "Issued on save"; with manual numbering you must key it.
5. Pick the **Transaction type**.
   Only Credit Note-class items from the Transaction Type master are offered; the item's tax scheme decides the tax included.
6. Confirm the **Document date** and **Transaction date (period)**; both default to today.
7. Enter the **Amount** before tax.
8. On a foreign-currency account, check the **Exchange rate**.
9. Choose what to **Apply against**.
   The list shows the debtor's open invoices and debit notes with their open balance.
   Leave it as "Leave as available credit" to keep the amount on the account for later use.
10. Add a **Description** if useful.
11. If the Analysis Dimensions section appears, pick a value for each dimension that matters; starred dimensions are compulsory.
12. Click **Save** to keep an Open draft, or **Post credit note** / **Submit for Approval**.

The apply-against choice is an intention recorded on the draft and carried out at posting.
If the target document is settled or voided in between, the credit note still posts and its amount becomes available credit instead; nothing fails.
A targeted credit note can never exceed the target's remaining balance.

### Raise a credit note from an invoice or debit note

On the Invoices, Debit Notes and Interest Documents screens, the ⋮ menu of a posted document offers **Raise Credit Note**.
It opens this same dialog with the debtor preset, the source document locked in **Apply against**, the amount seeded with the document's remaining balance, and its analysis dimensions copied.
Use that route when the purpose is to offset a specific document; use **New Credit Note** here when you want a free choice.

### Edit an Open credit note

1. Find the note and click **Edit**.
2. Change what you need, including the apply-against target.
   An automatically issued number cannot be changed.
3. Click **Save**, or submit it as well.

Only Open notes can be edited, and only within your role's data scope.
If you leave without saving, the system asks whether to discard your changes or keep editing.

### Submit an Open credit note from the list

1. Open the ⋮ menu and click **Submit**.
2. Read the confirmation: the number is issued now, the amount reduces the debtor's balance, and the apply-against choice takes effect, or the note goes into the approval chain.
3. Click **Post credit note** or **Submit for Approval**.

### Void an Open credit note

[Screenshot: Confirm void dialog with the Void reason field]

1. Open the ⋮ menu and click **Void**.
2. Enter the compulsory **Void reason**.
3. Click **Void**.

The number stays consumed and the record remains as Void with your reason.
A posted credit note cannot be voided from this screen; a posted but still unapplied credit note can be reversed from the debtor's account page.

### See where a posted credit note was applied

Open the ⋮ menu and click **Allocations** to list each invoice or debit note the credit was applied to ("Applied to Invoice INV-000031 120.00"), with any realised exchange gain or loss on a foreign-currency account.
If nothing has been applied yet the viewer says so.

## Field reference

### Debtor picker

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Search debtors** | No | Part of the account number, name or code. | Only active debtor accounts are listed. |

### New / Edit Credit Note

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Credit Note no.** | Only with manual numbering | The number, when your company keys numbers by hand. | Up to 30 characters; must not already be in use. With automatic numbering the number is issued on save and cannot be changed. |
| **Transaction type** | Yes | The credit item, for example `DISC - Goodwill discount`. | Credit Note-class, active items only. |
| **Document date** | Yes | The date the note is raised. | Defaults to today. |
| **Transaction date (period)** | Yes | The accounting period the note belongs to. | Defaults to the document date; change only when back-keying into a closed month. |
| **Amount** | Yes | The amount before tax, for example `120.00`. | Greater than zero; always shown with two decimals. When applied against a document, the amount including tax may not exceed that document's open balance. |
| **Exchange rate** | Yes, on a foreign-currency account | Base-currency units per unit of the account currency. | A positive decimal with at most 10 decimal places; defaults from Exchange Rates at the document date; frozen once posted. |
| **Apply against** | No | The open invoice or debit note this credit offsets, or "Leave as available credit". | Only the debtor's open debit documents are offered. Locked when the note was raised from a document. |
| **Description** | No | Free text printed on statements. | |
| **Analysis Dimensions** (one picker per dimension) | Yes for starred dimensions | The reporting value for each dimension. | Values come from Analysis Setup; a child's choices narrow to the chosen parent. |

### Confirm void

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Void reason** | Yes | Why the draft is being voided. | Up to 255 characters; kept for audit. |

## Tips & troubleshooting

- **"The credit note amount cannot exceed the balance of INV-000031 (250.00)."** and **"Credit note amount (gross 265.00) exceeds the balance of INV-000031 (250.00)."**
  A targeted credit note is capped at the target's open balance, tax included.
  Reduce the amount or clear the Apply against field to leave the credit on the account.
- **"The target document is not an open debit of this debtor."**
  The chosen document is no longer open; pick another or leave the note as available credit.
- **"Select a transaction type." / "This transaction type is not a Credit Note-class item."**
  Pick an active Credit Note-class item.
- **"Credit Note number is required (numbering is manual)."** and **"Credit Note number 'X' is already in use."**
  Key a number not used before.
- **"No USD exchange rate is effective on the document date - add one under Exchange Rates or key the rate on the document."**
  Add a rate under Exchange Rates or type one in the dialog.
- **"This allocation realizes an exchange difference - designate a Forex Transaction Type in AR Specification first."**
  Applying a foreign-currency credit note at a different rate from the invoice produces an exchange gain or loss; set the Forex entry under AR Specification, then submit again.
- **"This credit note is the outstanding leg of refund RF-000004 (deposit applied to outstanding) - it cannot be voided. Correct with a Debit Note instead."**
  A credit note created by a "Deposit to outstanding" refund is tied to that refund; raise a Debit Note to correct it.
- **"A posted credit note cannot be voided."**
  Use the debtor's account page to reverse an unapplied posted credit note, or raise a Debit Note.
- **"This credit note belongs to another user (outside your data scope)."**
  Your role's data scope only lets you amend your own or your department's documents.
- Credit notes left as available credit are consumed automatically only by the receipt and refund processes; apply them to a document explicitly when you want a specific invoice cleared.

## Related options

- **Account Receivable → Invoices** and **Debit Notes** - the documents a credit note corrects; both offer **Raise Credit Note** on posted rows.
- **Account Receivable → Interest Documents** - interest charges are also corrected with a credit note.
- **Account Receivable → Refunds** - the "Deposit to outstanding" refund posts a credit note automatically.
- **Account Receivable → Debtors** - the account-first view where credit notes can also be keyed.
- **Account Receivable → Transaction Type** - the Credit Note-class items and their tax schemes.
- **Account Receivable → AR Specification** - the Forex entry used when an allocation realises an exchange difference.
