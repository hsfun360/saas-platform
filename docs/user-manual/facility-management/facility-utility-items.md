# Utility Items

> **Where:** Facility Management → Utility Items
>
> **Who can use it:** users whose role includes the Facility Management module.
> The New utility item button needs the Create permission for this screen; Edit, Enable/Disable and everything that changes an item's units (Generate units, Add one unit, editing, enabling and disabling a unit) need the Edit permission; Delete (of an item or of a unit) also needs the Delete permission.

## What this option is for

A Utility Item is something the Control Station hands out or lets a person use: a locker by numbered unit, towels by quantity, a shower as a recorded use.
This screen is the club's list of those items and, for a numbered item, of its individual units (each locker with its own number).
For every item you decide how it is handed out, how many one person may hold, when it is due back, the fee charged automatically, and who the station may serve with it.
Staff come here when the club adds an item, adds or retires lockers, changes a limit or a fee, or takes an item out of use.
The Control Station offers the active items defined here; a Utility Item is not a facility, so it is never booked by slot.

## The screen at a glance

[Screenshot: Utility Items list]

- A count line shows how many utility items exist and how many are active.
- A search box filters the list as you type; it matches the code, the description and the way the item is handed out.
  When nothing matches, **Clear search** brings the whole list back.
- Each item is a card titled with its description and code, e.g. "Changing room locker (LOCKER)".
  Below the title: how it is handed out (**Numbered units**, **By quantity** or **Use only**), the fee item or "Free", "Members only" when guests may not take it, and "Inside a facility only" when it is reserved for a person inside a facility.
- The card's figures: **Units** (how many are free of the total) for a numbered item, **Out now** (pieces out, of the pieces the club owns when that is recorded) for an item by quantity, **Per person** (the limit, or "No limit") and **Due back** ("Same day" or "After n days"; not shown for a use-only item).
- A status chip shows **Active** or **Disabled**; active items are listed first, then by sort order.
- Each card has an **Edit** button and a ⋮ menu holding **Units (n)** (numbered items only), **Enable** or **Disable**, and **Delete**.
  On a numbered item you may not amend under your role's data scope, a **Units (n)** button opens the units to view only.
- The **New utility item** button sits at the bottom right.

## Common tasks

### Add a utility item

[Screenshot: New utility item dialog]

1. Click **New utility item**.
2. Enter the **Code** (e.g. `LOCKER`) and the **Description** (e.g. `Changing room locker`).
3. Pick **How it is handed out**:
   - **Numbered units** - each unit has its own number and is issued and taken back one by one, like a locker.
   - **By quantity** - pieces are handed out by count and counted back, like towels.
   - **Use only** - the use is recorded and there is nothing to return, like a shower.
4. Set the **Limit per person** (0 = no limit) and, unless the item is use-only, **Due back after (days)** (0 = the same day).
5. For an item by quantity, optionally enter **Pieces the club owns**.
6. Pick the **Fee charged automatically**, or leave it as **No fee - free**.
7. Set the two serving switches: **Guests may take it** and **Only for a person inside a facility** (see "Decide who the station may serve" below).
8. Set the **Sort order** - the order of the items on the station's strip.
9. Click **Save**.

A new item by quantity or use-only appears in the list straight away.
A new numbered item opens its **Units** view at once with the message "LOCKER created - now add its units.", because a numbered item is no use without them.

### Add the units of a numbered item (Generate units)

[Screenshot: Generate units view with the preview]

1. Open the card's ⋮ menu and click **Units (n)** (a new numbered item opens this view by itself).
2. Click **Generate units**.
3. Enter the **Prefix** (the system suggests the first letter of the item code), the **Digits** (3 digits turns 7 into 007), the **From number** and the **To number**.
   With prefix `L`, 3 digits, from 1 to 10 the units are `L001` to `L010`.
4. Optionally enter the **Location for these units**, e.g. `Men's changing room`.
5. Check the preview under the form.
   It lists every unit number in the range and tells you how many will be added and how many already exist and are left as they are.
   The preview opens with the suggested range; after you change the prefix, the digits or the numbers, click **Preview the units** to refresh it.
6. Click **Add n units**.
   The button names the exact number it adds and stays disabled until the preview shows at least one new unit.

Nothing is added before you click **Add n units**.
The system confirms with a message such as "10 units added to LOCKER (L001 to L010)." and returns to the list of units.
You can generate at most 500 units at a time; run it again for the next range.

### Add, edit, disable or delete one unit

[Screenshot: Units view of a numbered item]

1. Open the card's ⋮ menu and click **Units (n)**.
   Each unit shows its number, its location (or "No location"), its remarks and a status chip: **Available**, **Issued**, **Out of service** or **Disabled**.
2. To add a single unit, click **Add one unit**, enter the **Unit number**, optionally the **Location** and **Remarks**, and click **Save**.
3. To change a unit, open its ⋮ menu and click **Edit**; **Back** returns to the units without saving.
4. To take a unit out of use (a broken locker), open its ⋮ menu and click **Disable**; **Enable** brings it back.
   A unit that is issued must be taken back before it can be disabled.
5. To remove a unit entered by mistake, open its ⋮ menu and click **Delete** and confirm with **Delete unit**.
   A unit that has ever been issued cannot be deleted - disable it instead.
6. Click **Close** when you are done; the card's unit count is refreshed.

### Decide who the station may serve

- **Guests may take it** - on by default.
  Turn it off for an item kept for members only; a guest's tile at the station then says so, and the card shows "Members only".
- **Only for a person inside a facility** - off by default.
  Turn it on and the station issues the item only to a person who is inside a facility today: a member on an entry, or a guest admitted with them or on their pass.
  The card then shows "Inside a facility only".

### Edit a utility item

1. Find the item (use the search box if the list is long) and click **Edit**.
2. Change what you need.
   The **Code** and **How it is handed out** are locked while the item has units or is out with someone, and the code can never change once the item has been issued.
3. Click **Save**.

If you leave without saving, the system asks whether to discard your changes or keep editing.

### Disable / enable a utility item

- Open the ⋮ menu and click **Disable** to take an item out of use; the station no longer offers it, and its history is kept.
- Click **Enable** to bring it back.

### Delete a utility item

1. Open the ⋮ menu and click **Delete**.
2. Read the confirmation and click **Delete utility item**.

Only an item that was never issued and has no units can be deleted, and it cannot be undone.
Delete the units of a numbered item first, or disable the item instead.

## Field reference

### New / Edit utility item dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Code** | Yes | A short code for the item, e.g. `LOCKER`, `TOWEL`, `SHOWER`. | Up to 20 characters; letters, digits and underscores only; stored in capitals; must be unique within the company; frozen once the item is in use. |
| **Description** | Yes | The item's name as staff read it, e.g. `Changing room locker`. | Up to 255 characters. |
| **How it is handed out** | Yes | Numbered units (issued and taken back one by one), By quantity (handed out by count and counted back) or Use only (recorded, nothing to return). | Fixed while the item has units or is out with someone. |
| **Limit per person** | Yes | How many units or pieces one person may hold at a time, or for a use-only item how many uses one person may record in a day. | A whole number from 0 to 100; 0 = no limit; starts at 1. |
| **Due back after (days)** | Yes | How many days a unit or piece may stay out; the station lists it as overdue after that. | A whole number from 0 to 365; 0 = the same day; not shown for a use-only item. |
| **Pieces the club owns** | No | The club's stock of an item by quantity, e.g. `200`; the station then shows a figure such as "42 of 200 out". | A whole number from 0 to 1000000, or blank; shown for By quantity only; it never refuses an issue. |
| **Fee charged automatically** | No | The Issue Fee item from Transaction Types charged per unit, piece or use. | Type to search; No fee - free = nothing is charged; a disabled fee item cannot be saved. |
| **Guests may take it** | No | On = guests may be served the item; off = members only. | On by default. |
| **Only for a person inside a facility** | No | On = the station issues the item only to a person who is inside a facility today. | Off by default. |
| **Sort order** | Yes | The item's position on the station's strip; lower numbers come first. | A whole number from 0 to 9999; starts at 100. |

### New / Edit unit

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Unit number** | Yes | The number on the unit itself, as the desk reads it out, e.g. `L014`. | Up to 20 characters; letters, digits, underscores and hyphens; stored in capitals; must be unique within the item. |
| **Location** | No | Where the unit is, e.g. `Men's changing room, row B`. | Up to 255 characters. |
| **Remarks** | No | Anything staff should know about this unit. | Up to 255 characters. |

### Generate units

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Prefix** | No | The letters in front of every number, e.g. `L`. | Up to 12 characters; letters, digits, underscores and hyphens; stored in capitals. |
| **Digits** | Yes | How many digits each number is padded to; 3 digits turns 7 into 007. | A whole number from 1 to 6; starts at 3. |
| **From number** | Yes | The first number of the range. | A whole number from 0 to 99999; starts at 1. |
| **To number** | Yes | The last number of the range. | A whole number from 0 to 99999, not below the From number; at most 500 units at a time; starts at 10. |
| **Location for these units** | No | A location given to every unit added, e.g. `Men's changing room`. | Up to 255 characters. |

## Tips & troubleshooting

- If you see "Utility item 'LOCKER' already exists." the code is taken; edit that item instead or pick another code.
- If you see "The code is frozen - LOCKER has already been issued." the item has history under that code; keep the code and change the description instead.
- If you see "Delete the 40 units of LOCKER before changing how it is issued." or "LOCKER is out with 3 issues - take them back before changing how it is issued." the way an item is handed out can only change while it has no units and nothing is out.
- If you see "Fee item: 'LOCKERFEE' is not an issue fee." or "Fee item: 'LOCKERFEE' is disabled." pick an active item whose charge type is Issue Fee on Transaction Types.
- If you see "Cannot delete LOCKER - it has 12 issue records. Disable it instead." the item has been issued before; disable it to keep the history.
- If you see "Delete the 40 units of LOCKER first." remove the item's units before deleting the item.
- If you see "LOCKER already has a unit 'L014'." that unit number exists; pick another number.
- If you see "L014 is issued - take it back before disabling it." return the unit at the Control Station first.
- If you see "Cannot delete L014 - it has 3 issue records. Disable it instead." the unit has been issued before; disable it instead.
- If you see "Numbers: whole numbers from 0 to 99999, the last not below the first." or "Digits must be a whole number between 1 and 6." correct the range.
- If you see "Generate at most 500 units at a time." split the range into smaller runs.
- If the preview says "Every one of those 10 units already exists - nothing to add." the whole range is already there; change the numbers.
- If you see "View only - your role's data scope does not cover this utility item." you may look at the units but not change them; ask an administrator.
- If you see "Your role's data scope does not allow amending this record." the item belongs to someone outside your data scope.
- Call these things utility items, and their numbered pieces units; a facility is a place that is booked by slot or entered on registration.
- Disable rather than delete: a disabled item or unit keeps its history and can be enabled again.

## Related options

- Facility Management → Control Station - where utility items are issued, used and taken back.
- Facility Management → Transaction Types - the Issue Fee items offered as the fee charged automatically, and their prices.
