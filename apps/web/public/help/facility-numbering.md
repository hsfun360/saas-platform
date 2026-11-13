# Numbering Control

> **Where:** Facility Management → Numbering Control
>
> **Who can use it:** users whose role includes the Facility Management module.
> The New numbering scheme and Copy from company buttons need the Create permission for this screen; Edit and Enable/Disable need the Edit permission.

## What this option is for

The Numbering Control screen decides how your company numbers its facility documents: bookings, registrations and bills.
For each series you choose between **Auto-generate** - the system builds the next number from a format you define (prefix, running sequence, year or month) - and **Manual entry**.
Set this up before the desk opens: Facility Bookings cannot save a booking until the Booking No. series exists, the Control Station cannot check in or register anyone until the Registration No. series exists, and no bill can be opened until the Bill No. series exists.
The counter is advanced only when a document is actually created, so what you see as "Next" is exactly what the next document will receive.

## The screen at a glance

[Screenshot: Numbering Control list]

- A **Copy from company** button at the top right lets you bring the numbering configuration over from another company you have access to.
- Each configured series is a card titled with what it numbers (e.g. **Booking No.**).
  The line under the title shows the mode and, for an auto-generated series, **Next:** the exact next number and when the sequence resets.
- A status chip at the top right shows **Active** or **Disabled**.
- Each card has an **Edit** button and a ⋮ menu holding **Enable** or **Disable**.
- The **New numbering scheme** button floats at the bottom right while at least one series is still unconfigured; once all three series exist it disappears.
- Until the first series is set up the screen reads "No numbering configured yet. Use "New numbering scheme" to set up how each document series is numbered."

The three facility series are:

- **Booking No.** - given to a booking when it is made on Facility Bookings.
- **Registration No.** - given at the Control Station when a booked slot is checked in and when a person is registered for entry to a facility.
- **Bill No.** - given to every facility bill when it is opened: the bill of a booking, the bill of an entry at the Control Station, the bill for a paid Utility Item handed out at the Control Station, and the bill of a class enrolment that carries a fee.

## Common tasks

### Set up a numbering series

[Screenshot: New numbering scheme dialog]

1. Click **New numbering scheme**.
2. Under **Numbers**, check the series you are configuring; the system starts on the first series that is not configured yet.
3. Under **How it's assigned**, keep **Auto-generate** (see the tips before choosing Manual entry).
4. Set the **Prefix**, build the **Format** from the tokens (click a token beside *Insert:* to add it to the end of the format), choose the **Sequence digits**, the **Starting number** and the **Reset sequence** rule.
5. Check the **Next number will look like** preview at the bottom of the dialog; it updates as you type.
6. Click **Save**.

The series appears in the list and is used by the next document of that kind.
Repeat for the other two series.

### Edit a numbering series

1. Click **Edit** on the card.
2. Change the mode or the format fields; the **Numbers** choice is locked once a series exists.
3. Click **Save**.

Editing changes only the configuration: the running counter is never reset by an edit, and the preview shows where the sequence continues from.
If you leave the dialog with unsaved changes (Cancel, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.

### Copy the configuration from another company

[Screenshot: Copy numbering dialog]

1. Click **Copy from company**.
2. Pick the source company; only companies you have access to are listed.
3. Review the list of that company's active series.
   Each row shows the mode and, for an auto-generated series, what the first number here would look like and the reset rule.
   Series already configured in this company are marked "Already configured here - will be skipped." and cannot be ticked; new ones are ticked for you.
   Use **Select all new (x of y)** to tick or untick all the new ones at once.
4. Click **Copy n scheme(s)**, or **Back** to choose a different company.

Only the configuration is copied; every copied series starts counting afresh from its starting number here.
The system confirms how many series were copied and how many were skipped.

### Disable / enable a series

- Open the card's ⋮ menu and click **Disable** to mark a series Disabled.
  A disabled series is not offered when another company copies its numbering from this one.
- Open the ⋮ menu and click **Enable** to mark it Active again.

## Field reference

### New / Edit numbering scheme dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Numbers** | Yes | Which facility series this scheme numbers: Booking No., Registration No. or Bill No. | One scheme per series; cannot be changed after creation. |
| **How it's assigned** | Yes | **Auto-generate** builds the number from the format below. **Manual entry** means the system does not generate the number. | Switching to Manual entry hides the format fields. |
| **Prefix** | No | The fixed text the `{PREFIX}` token stands for, e.g. `FB`. | Up to 20 characters. Auto-generate only. |
| **Reset sequence** | Yes | When the running sequence goes back to the starting number: **Never (continuous)**, **Annually** or **Monthly**. Pair Annually with a `{YY}` or `{YYYY}` token, and Monthly with a year token plus `{MM}`, so numbers stay unique. | Starts on Never (continuous). Auto-generate only. |
| **Format** | Yes | The template of the number, e.g. `{PREFIX}{YY}{MM}{SEQ}` with prefix `FB` and 5 sequence digits gives `FB261100001` in November 2026. Tokens: `{PREFIX}` the prefix, `{SEQ}` the padded sequence, `{YYYY}` 4-digit year, `{YY}` 2-digit year, `{MM}` 2-digit month. | Up to 60 characters; starts as `{PREFIX}{SEQ}`. Auto-generate only. |
| **Sequence digits** | Yes | How many digits the `{SEQ}` token is padded to, e.g. `5` gives `00042`. | A whole number from 0 to 12; starts at 5. Auto-generate only. |
| **Starting number** | Yes | The first sequence value issued, and the value after each reset. | A whole number of at least 1; starts at 1. Auto-generate only. |

### Copy numbering dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Company** | Yes | The company whose numbering you want to copy. | Only companies you have access to are listed; the current company is not offered. |
| **Select all new** / the tick on each row | Yes | Which series to copy. | Series already configured here cannot be ticked; at least one row must be ticked before the Copy button works. |

## Tips & troubleshooting

- Keep the **Booking No.** and **Bill No.** series on **Auto-generate**.
  The note in the dialog says staff key the number on the document's own screen, but Facility Bookings has no box for keying either number, so a Manual entry series stops the work with "The Booking No. scheme is manual - key in a booking number." or "The Bill No. scheme is manual - key in a bill number."
- If the **Registration No.** series is on Manual entry, the Control Station does not ask for a number; the system gives each registration a reference of its own that starts with `R-`.
  Choose Auto-generate if you want registrations numbered in sequence.
- If Facility Bookings says "Configure the Booking No. numbering scheme first (Facility Management - Numbering Control)." the Booking No. series does not exist yet; create it here.
- If the Control Station says "Configure the Registration No. numbering scheme first (Facility Management - Numbering Control)." create the Registration No. series here.
- If opening a bill says "Configure the Bill No. numbering scheme first (Facility Management - Numbering Control)." create the Bill No. series here.
- If you see "A numbering scheme for this purpose already exists." that series is already configured; edit the existing card instead.
- If you see "The {TYPE} token is not available for this module - its numbers carry no document type." remove `{TYPE}` from the Format; facility numbers do not use it.
- If you see "Sequence padding must be a whole number from 0 to 12." or "Starting number must be a whole number of at least 1." correct those two boxes.
- If you see "A format is required (use 60 characters or fewer)." the Format box is empty or too long.
- If you see "You have access to no other company to copy from." or "You have no access to that company." your login holds no other company; ask an administrator to grant it, or configure the series by hand.
- If you see "Select a different company to copy from." the source and the current company are the same.
- If the copy list reads "... has no active numbering schemes to copy." the company you picked has nothing set up for Facility Management; go **Back** and pick another, or configure the series by hand.
- If you see "Select a workspace first." pick your company at the top of the screen and try again.
- Changing the format of a series that is already in use does not renumber existing documents; new documents simply follow the new format from the current counter.
- Raising the **Starting number** above the last number issued makes the next document jump to the new starting number; lowering it changes nothing until the next reset.

## Related options

- Facility Management → Facility Bookings - issues the Booking No. when a booking is made and the Bill No. when a booking's bill is opened.
- Facility Management → Control Station - issues the Registration No. at check-in and entry, and the Bill No. for entries and paid Utility Items.
- Facility Management → Class Schedule - an enrolment that carries a fee opens a bill with the next Bill No.
- Membership Management → Numbering Control, Golf Management → Numbering Control and Account Receivable → Numbering Control - the same screen for those modules' own series.
