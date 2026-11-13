# No-show Charges

> **Where:** Facility Management → No-show Charges
>
> **Who can use it:** users whose role includes the Facility Management module.
> The Post and Re-price buttons and the ⋮ menu (Waive, Open booking) need the Edit permission, and the charge must be within your data scope.

## What this option is for

The No-show Charges screen lists every penalty the club has raised on a facility booking under its cancellation notice and no-show rules.
A charge is raised for one of two reasons: the booker did not turn up for a booked slot (**No show**), or the booking was cancelled inside the cancellation notice (**Late cancellation**).
Charges are never created on this screen; they come from the Control Station, when a booked slot is marked as a no-show or swept at the end of the day, and from the Facility Bookings screen, when a booking is cancelled late.
Staff come here to follow up: post a charge that could not reach the booker's account at the time, price a charge that was raised without a price, waive a charge with a reason, and see which Account Receivable document a posted charge became.
A no-show can also count as a strike towards a booking suspension, and this screen is where a strike is cleared when the club decides to forgive it.

## The screen at a glance

[Screenshot: No-show Charges list on the Pending filter]

- Four buttons filter the list by status: **Pending** (where the screen starts), **Posted**, **Waived** and **All**.
- On the Pending filter, a "Pending total" beside the buttons adds up the charges still waiting.
- A search box filters the listed charges as you type, matching the booking number, the booker's name, the member number and the facility and time of the booking.
- Each charge is a card.
  The title gives the reason (No show or Late cancellation), the booking number and the booking date.
  The next line shows the booker with the member number or "(visitor)", the facility and time, for example "CT1 09:00 - 11:00 (2 slots)", and a red **Strike** chip when the no-show counts towards a suspension.
  Underneath are the **Item** charged (with "x 2" when the quantity is more than one) and the **Amount** with its tax.
  A posted card adds **Posted** with the Account Receivable document number and time; a waived card adds **Waived** with the reason and time; a pending card that could not be posted adds **Pending** with the reason in red.
- A status chip at the top right shows **Pending** (blue), **Posted** (green) or **Waived** (grey).
- A pending card shows **Post** when the charge has a price, or **Re-price** when it has none, and a ⋮ menu holding **Waive** and **Open booking**.
  Posted and waived cards show a **Booking** button only.
- While cancellation notice and no-show control is switched off in Facility Specification, a note at the top reads "No-show control is off on Facility Specification - no new charges are raised. Existing ones stay listed here."
- With nothing to show, the screen reads, for example, "No pending charges. The Control Station raises one when a booked slot is marked no-show, and a cancel inside the notice raises a late cancellation charge."

## Common tasks

### Post a pending charge to the booker's account

1. Stay on the **Pending** filter to see what is outstanding.
   The red **Pending** line on a card says why the charge did not post, for example that the booker's member status forbids charging to account.
2. Fix the cause (see Tips & troubleshooting below).
3. Click **Post** on the card.

The charge posts at once, without a further confirmation.
The system posts one invoice to the booker's member account in Account Receivable and shows "Charge on booking FB-000123 posted - INV-000045.".
The card moves to the **Posted** filter with the document number, and the booker is emailed the charge notice when an email address is on their member record.
If posting fails again, the card stays pending and the red line shows the new reason.
Posting a penalty is never refused by the booker's credit limit.

### Price a charge that was raised without a price

A charge is raised without a price, at 0.00, when no no-show charge item or no price card was in force for the booking date.
Its item reads "No-show (unpriced)", the red Pending line says what is missing, and the card offers **Re-price** instead of Post.

1. Set up what is missing: pick the **No-show charge item** in Facility Specification, or give the item a price card in force on the booking date under Transaction Types.
2. Click **Re-price** on the card.

The message reads "Charge on booking FB-000123 re-priced at 21.20.", the card shows the item, the amount and the tax, and the **Post** button appears.

### Waive a pending charge

[Screenshot: Waive the charge drawer]

1. Open the card's ⋮ menu and click **Waive**.
2. Read the summary at the top of the drawer; it names the reason, the booker, the facility and time, and the amount.
3. Enter the **Reason**; this is required.
4. On a no-show that counts as a strike, decide whether to tick **Also clear the strike (the no-show no longer counts toward a suspension)**.
   Left unticked, the charge is waived but the strike still counts.
5. Click the button, which states the amount being waived, for example **Waive 21.20**, or **Cancel** to back out.

The message reads "Charge on booking FB-000123 waived." or "Charge on booking FB-000123 waived and the strike cleared.".
The card moves to the **Waived** filter and keeps the reason and time.
Nothing is posted to the booker's account.
If you leave the drawer after typing, the system asks whether to discard your changes or keep editing.

### Go to the booking behind a charge

1. On a pending card, open the ⋮ menu and click **Open booking**; on a posted or waived card, click **Booking**.
2. The system takes you to the Facility Bookings screen.
3. Type the booking number from the card in the search box there and click **View** on the booking.

### Find a charge

- Pick the status filter the charge should be under, or **All**.
- Type part of the booking number, the booker's name or the member number in the search box; the list narrows as you type.
- Use **Clear search** when nothing matches.

## Field reference

### Filters

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| Status buttons | No | **Pending**, **Posted**, **Waived** or **All**. | Starts on Pending; up to 500 charges are listed, the latest booking date first. |
| **Search** | No | Any part of the booking number, booker name, member number or the facility and time. | Filters the charges already listed under the chosen status. |

### Waive the charge drawer

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Reason** | Yes | Why the club is not charging, e.g. `Court flooded, play not possible`. | Up to 255 characters; kept on the card. |
| **Also clear the strike** | No | Tick to stop this no-show counting towards a booking suspension. | Shown only on a no-show charge that counts as a strike. |

## Tips & troubleshooting

- If the Pending line says "The booker is a visitor - no ledger account to charge; collect at the desk or waive." the booking was made by a visitor, who has no account to post to; collect the amount at the desk and waive the card with that note.
- If the Pending line says "Member A0018 (Defaulter) is barred from charging to account." the member's status forbids charging to account; resolve the status under Membership, or waive.
- If the Pending line says "Open an AR invoice transaction type to the Facility module first (AR - Transaction Type)." create or edit an Account Receivable transaction type of class Invoice and open it to Facility, then post again.
- If the Pending line says "Several AR transaction types are opened to Facility - keep exactly one so charges post unambiguously." leave only one Account Receivable invoice type opened to Facility.
- If the Pending line says "No ledger account exists for this debtor (run debtor provisioning first)." or "Debtor account is closed." the booker's account in Account Receivable is missing or not active; ask Finance to resolve it, then post again.
- If the Pending line says "No no-show item is set up - pick one on Facility Specification." or "'NOSHOW' has no price card in force on 2026-11-14 - set up its pricing first." complete the setup and click **Re-price**.
- If you see "The charge is unpriced - re-price it first." the charge has no amount yet; use **Re-price**.
- If you see "No-show control is off on Facility Specification." a charge can only be re-priced while cancellation notice and no-show control is switched on.
- If you see "This charge is posted." or "This charge is waived." someone else has already dealt with the charge; pick the status filter again to reload the list.
- If you see "This charge is already on the ledger - reverse it with an AR credit note." the charge was already posted; a posted charge is reversed by Finance in Account Receivable, not here.
- If you see "Give the reason for waiving." or "Give a reason for waiving the charge." the Reason box is empty.
- If you see "You are not allowed to amend this charge." the charge lies outside your role's data scope.
- The amount is fixed when the charge is raised, from the price card and tax of the booking date; changing the item later does not alter existing cards, except through **Re-price** on a card that had no price.
- The quantity follows the **Charge basis** in Facility Specification: one per booking, one per missed slot, or one per participant.
- A late cancellation never counts as a strike; only a no-show on a Facility Type set to count no-shows as strikes does.
- Clearing a strike here does not end a suspension that has already started; lift that on the Booking Suspensions screen.
- A late cancellation charge that was waived at the moment of cancelling appears here under **Waived** with the reason given on the Facility Bookings screen.

## Related options

- Facility Management → Facility Specification - the Cancellation and No-show card: the notice hours, charge or refuse, the no-show charge item, the charge basis, the grace minutes and the strike numbers.
- Facility Management → Facility Types - the switches that decide whether a type charges no-shows and late cancellations and whether its no-shows count as strikes.
- Facility Management → Control Station - the **No show** button on a booked slot and the **End of day** sweep that raise the no-show charges.
- Facility Management → Facility Bookings - cancelling a booking inside the notice raises a late cancellation charge, shown before you confirm, with an option to waive it.
- Facility Management → Booking Suspensions - the suspensions that strikes lead to.
- Facility Management → Transaction Types - the No Show Charges item, its price card and tax.
- Account Receivable → Transaction Type - the invoice type opened to Facility that the charges post with.
- Account Receivable → Debtor Listing - the booker's account where the posted invoice appears.
