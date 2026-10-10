# Numbering Control

> **Where:** Golf Management → Numbering Control
>
> **Who can use it:** users whose role includes the Golf Management module.
> The New numbering scheme and Copy from company buttons need the Create permission for this screen; Edit and Enable/Disable need the Edit permission.

## What this option is for

The Numbering Control screen decides how your company numbers its golf documents: bookings, registrations, bills, rain checks, group-booking proformas and refund requests.
For each series you choose between **Auto-generate** - the system builds the next number from a format you define (prefix, running sequence, year or month) - and **Manual entry**, where staff key the number in themselves.
Set this up before taking the first booking: the Golf Booking screen cannot confirm a booking until the Booking No. series exists, and the front desk needs the Registration No. and Bill No. series the first time a player registers and is billed.
The counter runs without gaps and is advanced only when a document is created, so what you see as "Next" is exactly what the next document will receive.

## The screen at a glance

[Screenshot: Numbering Control list]

- A **Copy from company** button at the top right lets you bring the numbering configuration over from another company you have access to.
- Each configured series is a card titled with what it numbers (e.g. **Booking No.**).
  The subline shows the mode and, for an auto-generated series, **Next:** the exact next number and when the sequence resets.
- A status chip at the top right shows **Active** or **Disabled**.
- Each card has an **Edit** button and a ⋮ menu holding **Enable** or **Disable**.
- The **New numbering scheme** button floats at the bottom right while at least one series is still unconfigured; once all six series exist it disappears.

The six golf series are **Booking No.**, **Registration No.**, **Bill No.**, **Rain Check No.**, **Proforma No.** and **Refund Request No.**

## Common tasks

### Set up a numbering series

[Screenshot: New numbering scheme dialog]

1. Click **New numbering scheme**.
2. Under **Numbers**, pick the series you are configuring (only series not yet configured are offered).
3. Under **How it's assigned**, keep **Auto-generate** or switch to **Manual entry**.
4. For an auto-generated series, set the **Prefix**, build the **Format** from the tokens (click a token under *Insert* to append it), choose the **Sequence digits**, the **Starting number** and the **Reset sequence** rule.
5. Check the **Next number will look like** preview at the bottom of the dialog; it updates as you type.
6. Click **Save**.

The series appears in the list and is used by the next document of that kind.

### Edit a numbering series

1. Click **Edit** on the card.
2. Change the mode or the format fields; the **Numbers** choice is locked once a series exists.
3. Click **Save**.

Editing changes only the configuration: the running counter is never reset by an edit, and the preview shows where the sequence continues from.

### Copy the configuration from another company

[Screenshot: Copy numbering dialog]

1. Click **Copy from company**.
2. Pick the source company; only companies you have access to are listed.
3. Review the list of that company's active series.
   Each row shows the mode, what the first number here would look like and the reset rule.
   Series already configured in this company are greyed out with "Already configured here - will be skipped."; new ones are pre-selected.
   Use **Select all new (x of y)** to toggle the selection.
4. Click **Copy n scheme(s)**.

Only the configuration is copied; every copied series starts counting afresh from its starting number here.

### Disable / enable a series

- Open the card's ⋮ menu and click **Disable** to switch a series off.
- Open the ⋮ menu and click **Enable** to switch it back on.

## Field reference

### New / Edit numbering scheme dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Numbers** | Yes | Which golf series this scheme numbers: Booking No., Registration No., Bill No., Rain Check No., Proforma No. or Refund Request No. | One scheme per series; cannot be changed after creation. |
| **How it's assigned** | Yes | **Auto-generate** builds the number from the format below. **Manual entry** expects staff to key the number in when the document is created; the system only checks it is not already used. | Switching to Manual entry hides the format fields. |
| **Prefix** | No | The fixed text the `{PREFIX}` token stands for, e.g. `B`. | Up to 20 characters. Auto-generate only. |
| **Reset sequence** | No | When the running sequence goes back to the starting number: **Never (continuous)**, **Annually** or **Monthly**. Pair Annually with a `{YY}` or `{YYYY}` token and Monthly with `{MM}` so numbers stay unique. | Auto-generate only. |
| **Format** | Yes | The template of the number, e.g. `{PREFIX}{YY}{MM}{SEQ}` with prefix `B` and 5 sequence digits gives `B261000001` in October 2026. Tokens: `{PREFIX}` the prefix, `{SEQ}` the padded sequence, `{YYYY}` 4-digit year, `{YY}` 2-digit year, `{MM}` 2-digit month. `{TYPE}` is the membership type code and is meant for membership numbers, so leave it out of golf series. | Up to 60 characters; defaults to `{PREFIX}{SEQ}`. Auto-generate only. |
| **Sequence digits** | Yes | How many digits the `{SEQ}` token is padded to, e.g. `5` gives `00042`. | A whole number from 0 to 12; default 5. Auto-generate only. |
| **Starting number** | Yes | The first sequence value issued (and the value after each reset). | A whole number of at least 1; default 1. Auto-generate only. |

### Copy numbering dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Company** | Yes | The company whose numbering you want to copy. | Only companies you have access to are listed; you cannot copy from the current company. |
| **Select all new** / per-row tick | Yes | Which series to copy. | Series already configured here cannot be selected; at least one row must be ticked. |

## Tips & troubleshooting

- If you see "A numbering scheme for this purpose already exists." that series is already configured; edit the existing card instead.
- If you see "Sequence padding must be a whole number from 0 to 12." or "Starting number must be a whole number of at least 1." correct those two boxes.
- If you see "A format is required (use 60 characters or fewer)." the Format box is empty or too long.
- If you see "You have access to no other company to copy from." or "You have no access to that company." your login holds no other company; ask an administrator to grant it, or configure the series by hand.
- If you see "Select a different company to copy from." the source and the current company are the same.
- If the Golf Booking screen says "Configure the Booking No. numbering scheme first (Golf Management → Numbering Control)." the Booking No. series does not exist yet; create it here.
- Keep the **Booking No.** series on **Auto-generate**: the Golf Booking screen has no box for keying a number, so a Manual entry Booking No. series stops bookings with "The Booking No. scheme is manual - key in a booking number."
- Changing the format of a series that is already in use does not renumber existing documents; new documents simply follow the new format from the current counter.
- The in-dialog preview shows the `{TYPE}` token as a sample (`ORD`); that token belongs to membership numbering.

## Related options

- Golf Management → Golf Booking - issues the Booking No. when a booking is confirmed.
- Golf Management → Front Desk → Tee Time Sheet - issues the Registration No. when a player registers and the Bill No. when a bill is opened.
- Golf Management → Group Bookings - issues the Booking No. for a group, the Bill No. for deposits and the group bill, the Proforma No. when the proforma is printed, and the Refund Request No. for refund requests.
- Membership Management → Numbering Control and Account Receivable → Numbering Control - the same screen for those modules' own series.
