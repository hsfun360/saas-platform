# No-show Charges

> **Where:** Golf Management → Front Desk → No-show Charges
>
> **Who can use it:** users whose role includes the Golf Management module and holds this menu.

## What this option is for

The No-show Charges screen lists every penalty the club has raised against a booker under its Cancellation & No-show rules: a booking's players did not register for their tee time (**No show**), or the booking was cancelled with less than the required notice (**Late cancellation**).
Charges are raised elsewhere - by the Tee Time Sheet's **No-shows** review and by cancelling a booking late on the Golf Booking screen - never on this screen.
Staff come here to follow up: post a charge that could not reach the booker's account at the time, waive a pending charge with a reason, and see which invoice a posted charge became.
The menu is separate from the tee sheet and bookings so the finance desk can hold it on its own.

## The screen at a glance

[Screenshot: No-show Charges list]

- Two date fields filter by **Play date from** / **to**; the range starts 31 days ago and reaches 31 days ahead, because a late cancellation belongs to a future play date.
- A **Status** filter narrows the list to **Pending**, **Posted** or **Waived**; **All** shows everything.
- A search box filters the loaded list as you type, matching the booking number, the booker's name or member number, the players and the invoice number.
- A count line reads e.g. "6 charges · 1 pending · posted 345.60".
- Each charge is a card: the booker and the total amount as the title; a chip for the reason (No show / Late cancellation), the booking number and play date, and the players concerned; then the charge line (item, quantity × price, tax) and - depending on the status - the AR invoice number and time, the waive reason and time, or the reason the charge is still pending (in red).
- The status chip sits top-right: **Posted** (green), **Pending** (blue) or **Waived** (grey).
- A pending card shows **Post to account** and a ⋮ menu holding **Waive**; posted and waived cards have no actions.

## Common tasks

### Post a pending charge to the booker's account

1. Set the **Status** filter to **Pending** to see what is outstanding; the red **Pending** line on each card says why it did not post - for example the club had no Account Receivable invoice type opened to Golf, or the booker's account was barred.
2. Fix the cause (see Tips below).
3. Click **Post to account** on the card.

The system posts one invoice to the booker's member account, the card flips to **Posted** with the invoice number, and the booker receives the charge notice email if an email address is on their member record.
If posting fails again the card stays Pending and the red line shows the new reason.

### Waive a pending charge

[Screenshot: Waive charge dialog]

1. Open the card's ⋮ menu and click **Waive**.
2. Read the confirmation - it names the amount, the booking and the booker - and enter the **Reason** (required).
3. Click **Waive charge**.

The card turns **Waived** and keeps the reason and time; the no-show itself stays on record.
Nothing is posted to the account.

### Find a charge

- Type part of a booking number, name, member number, player name or invoice number in the search box - the list narrows as you type.
- Use **Clear search** when nothing matches, or widen the date range if the booking's play date lies outside it.

## Field reference

### Filters

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Play date from** / **to** | No | The play-date range to list, picked from the calendar. | Defaults to 31 days back and 31 days ahead; up to 500 charges are listed. |
| **Status** | No | All, Pending, Posted or Waived. | |
| **Search** | No | Any part of the booking number, booker, member number, players or invoice number. | Filters the loaded list only. |

### Waive charge dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Reason** | Yes | Why the club is not charging, e.g. `Course flooded after 13:30`. | Up to 255 characters; kept on the card. |

## Tips & troubleshooting

- If the Pending line says "Open an AR invoice transaction type to the Golf module first (AR → Transaction Type)", create or edit an Account Receivable transaction type of class Invoice and tick Golf under its usable modules, then post again. Keep exactly one such type - with several, charges cannot post ("Several AR transaction types are opened to Golf").
- If the Pending line says "The booker is not a member - no ledger account to charge; collect at the counter", the booking was made by a public golfer. Collect the amount at their next visit (the No Show Charges item can be added to a front-desk bill) and waive the card with that note.
- If the Pending line says the member "is barred from charging to account", their member status forbids charge-to-account; resolve the status under Membership, or waive.
- If the Pending line says the charge item "has no price in force", add a price card to the No Show Charges transaction type effective on or before the play date.
- If you see "Only a pending charge can be posted" or "This charge is already on the ledger - reverse it with an AR credit note", the charge was already posted; a posted charge is reversed through Account Receivable, not here.
- If you see "Give a reason for waiving the charge", the reason box is empty.
- Posting never checks the credit limit - a penalty is a billing fact like a subscription fee - so a Pending card is always a configuration or account-status matter, not a credit refusal.
- The amount is fixed when the charge is raised (price card and tax scheme of that day); changing the Transaction Type later does not alter existing cards.

## Related options

- Golf Management → Golf Specification - the Cancellation & No-show rules: notice hours, charge or refuse, the No-show Charge type and the per-player / per-booking basis.
- Golf Management → Front Desk → Tee Time Sheet - the **No-shows** button that records who did not register and raises the charges.
- Golf Management → Golf Booking - cancelling a booking inside the notice period raises a late-cancellation charge (shown before you confirm, with a waive option).
- Golf Management → Transaction Type - the No Show Charges item, its flat price and tax scheme.
- Account Receivable → Transaction Type - the invoice type opened to Golf that the charges post with.
- Account Receivable → Debtors - the booker's account where the posted invoice appears.
