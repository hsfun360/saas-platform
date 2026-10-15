# Rain Checks

> **Where:** Golf Management → Front Desk → Rain Checks
>
> **Who can use it:** users whose role includes the Golf Management module and holds this menu.

## What this option is for

A rain check is a credit the club owes a golfer whose paid round was abandoned - a thunderstorm, a course closure, play called off after a few holes.
The front desk issues it from the Tee Time Sheet against the player's settled bill; the golfer redeems it once, as a payment on a later bill of their own, before it expires.
The Rain Checks screen lists every rain check the club has issued so staff can see what is still open and how much it is worth, which bill a redeemed one paid and what was left over, which ones expired unused, and cancel an issued rain check that should not stand.
Rain checks are issued and redeemed on the Tee Time Sheet, never here.
The menu is separate so the finance desk can hold it without the tee sheet.

## The screen at a glance

[Screenshot: Rain Checks list]

- Two date fields filter by the **Play date from** / **to** of the abandoned round; the range starts 180 days ago and ends today, because a rain check stays open long after its round.
- A **Status** filter narrows the list to **Issued** (open), **Redeemed**, **Expired** or **Cancelled**; **All** shows everything.
- A search box filters the loaded list as you type, matching the rain check number, the golfer's name or member number, the source bill and the bill it was redeemed on.
- A count line reads e.g. "4 rain checks · 2 open · open value 120.00".
- Each rain check is a card: the rain check number, the golfer and the value as the title; the play date, holes played of holes registered, the source bill and the reason on the subline; then the value against the basis amount and the issue time, and - depending on the status - the valid-until date, the redemption (bill, time, amount applied and any amount forfeited), the expiry, or the cancellation reason and time.
- The status chip sits top-right: **Issued** (blue), **Redeemed** (green), **Expired** or **Cancelled** (grey).
- An issued card carries a ⋮ menu holding **Cancel rain check**; the other statuses have no actions.

## Common tasks

### See what is open

1. Set the **Status** filter to **Issued**.
2. Read the count line for the number of open rain checks and their total value; each card shows its **Valid until** date.

A rain check past its valid-until date is expired automatically overnight and the member of staff who issued it is notified.

### Cancel an issued rain check

[Screenshot: Cancel rain check dialog]

1. Open the card's ⋮ menu and click **Cancel rain check**.
2. Read the confirmation - it names the number, the value and the golfer - and enter the **Reason** (required).
3. Click **Cancel rain check**.

The card turns **Cancelled** and keeps the reason and time.
The settled bill the rain check came from is not changed, and the golfer can no longer redeem it.
A redeemed, expired or cancelled rain check cannot be cancelled.

### Find a rain check

- Type part of a rain check number, name, member number or bill number in the search box - the list narrows as you type.
- Use **Clear search** when nothing matches, or widen the date range if the round lies outside it.

## Field reference

### Filters

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Play date from** / **to** | No | The play-date range of the abandoned rounds, picked from the calendar. | Defaults to 180 days back to today; up to 500 rain checks are listed. |
| **Status** | No | All, Issued, Redeemed, Expired or Cancelled. | |

### Cancel rain check

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Reason** | Yes | Why the rain check is cancelled. | Up to 255 characters; kept on the record. |

## Tips & troubleshooting

- If you see "Rain check RC... is redeemed and cannot be cancelled" (or expired / cancelled), the rain check is already closed - only an issued one can be cancelled.
- If you see "Give a reason for cancelling the rain check.", type the reason before confirming.
- If you see "Your role's data scope does not allow amending this record.", the rain check was issued by someone outside your data scope - ask a supervisor.
- A rain check belongs to the golfer it was issued to: the Tee Time Sheet only offers it on that golfer's own bills, and it is used once - any value above that bill is forfeited and shown on the card.
- The value a rain check is issued at follows the Rain Checks section of Golf Specification: the settled bill's green-fee lines or the whole bill, prorated by the holes not played when that option is on; the desk may lower the amount at issue, never raise it.

## Related options

- Golf Management → Front Desk → Tee Time Sheet - issues a rain check (⋮ menu of a registered player whose bill is settled) and redeems it with the Rain Check payment type at settlement.
- Golf Management → Golf Specification - the Rain Checks section: the switch, validity, value basis and proration.
- Golf Management → Common Setup → Payment Type - a payment type of class Rain Check is needed to redeem one.
- Golf Management → Numbering Control - the Rain Check No. series.
