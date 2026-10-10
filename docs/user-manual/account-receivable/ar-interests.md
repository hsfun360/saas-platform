# Interest Documents

> **Where:** Account Receivable → Interest Documents
>
> **Who can use it:** users whose role includes the Account Receivable module and holds this menu.
> This is a read-only screen: nothing is keyed here, so this menu's Create, Edit and Delete permissions change nothing.
> The **Raise Credit Note** action appears only when your role holds the Create permission on the Credit Notes menu.

## What this option is for

The Interest Documents screen lists every late-payment interest charge posted to debtor accounts.
These documents are produced by the Interest Generation run, never typed in by hand, so the screen has no **New** button, no editing and no void.

Come here to find an interest charge, see which overdue documents it was computed from, check how it was settled, and raise a Credit Note when an interest charge needs correcting.

## The screen at a glance

[Screenshot: Interest Documents list with the search box, date range, status filter and document cards]

- A search box filters by document number or description as you type.
- Two date fields limit the list to interest documents dated in a window.
  The window starts as the current month; picking a From date snaps the To date to the last day of that month, the To date can never be earlier than the From date, and **All dates** clears both.
- A status filter offers **All statuses**, **Open**, **Posted** and **Void**.
  In practice interest documents are always Posted, because the run posts them directly.
- Each document is a card: the document number and the debtor's name; a sub-line with the account number, a currency chip on a foreign-currency account and the description; then Date, Amount, Balance and Due.
- The status chip sits top-right.
- Each card has a ⋮ menu holding **Allocations**, **Interest breakdown** and, when your role may create credit notes, **Raise Credit Note**.
- **Load more** appears at the bottom when more documents match than are shown.
- When the month has no interest documents yet, the screen says so and points you to the Interest Generation run.

## Common tasks

### See which overdue documents produced an interest charge

[Screenshot: Interest breakdown viewer]

1. Open the ⋮ menu on the document and click **Interest breakdown**.
2. The viewer shows the run's rate (flat percentage) and cutoff date, then one line per overdue document: its number, due date, days late, the overdue amount and the interest on that line.
   Lines that were excluded from the run before posting are shown struck through; they never contributed.
3. The total row reads how many lines were included and the overdue and interest totals, which equal the posted amount exactly.

### See how an interest charge was settled

Open the ⋮ menu and click **Allocations** to list each receipt or credit note that settled it, with any realised exchange gain or loss on a foreign-currency account.
If nothing has been applied yet the viewer says so.

### Correct an interest charge

1. Open the ⋮ menu on the document and click **Raise Credit Note**.
2. The Credit Note dialog opens with the debtor preset, the interest document locked as the document to apply against, the amount seeded with its remaining balance and its analysis dimensions copied.
3. Adjust the amount if you are only crediting part of it, then save or submit as for any credit note.

An interest charge is never voided; a Credit Note is the only correction.
The action is refused when the document is already fully allocated.

### Find a document

- Type part of the document number or description in the search box.
- Widen the date window or click **All dates** when the document was posted in another month.

## Field reference

### Filters

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Search** | No | Part of the document number or description. | |
| **Document date from** / **to** | No | The date window to list, picked from the calendar. | Defaults to the current month; the To date never precedes the From date. |
| **Status filter** | No | All statuses, Open, Posted or Void. | |

This screen has no entry form.

## Tips & troubleshooting

- **"An interest charge cannot be voided - raise a Credit Note to offset it."**
  Interest documents are system-posted and immutable; use **Raise Credit Note**.
- **"X is already fully allocated - there is no balance left to offset with a Credit Note."**
  The charge has been fully settled; nothing remains to credit.
- **"This document carries no generation reference."**
  The document was not produced by an interest run, so there is no breakdown to show.
- Interest documents are posted under the Interest-class transaction type designated on AR Specification ("Interest run posts under"); their tax, if any, comes from that entry's tax scheme.
- To stop a debtor being charged interest in future, untick "Charge late-payment interest" on their account under Debtors; existing documents are unaffected.

## Related options

- **Account Receivable → Interest Generation** - where interest is computed, reviewed and posted.
- **Account Receivable → Credit Notes** - the correction document for an interest charge.
- **Account Receivable → Debtors** - the per-account "Charge late-payment interest" switch.
- **Account Receivable → AR Specification** - the Interest-class entry the run posts under.
- **Account Receivable → Transaction Type** - the "Charge late-payment interest on overdue items" flag per billing item, which decides which documents attract interest.
