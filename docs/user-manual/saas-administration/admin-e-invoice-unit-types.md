# e-Invoice Unit Types

> **Where:** SaaS Administration → Reference data → e-Invoice Unit Types
>
> **Who can use it:** platform (system) administrators whose role includes the SaaS Administration module.
> The **Sync now** and **New code** buttons need the Create permission, **Edit** and **Enable/Disable** need the Edit permission, and **Delete** needs the Delete permission; a role without a permission simply does not see that button.

## What this option is for

Malaysia's e-Invoicing system (MyInvois, run by the tax authority LHDN) expresses the quantity on each e-Invoice line in a standard unit of measure code taken from the international UN/ECE Recommendation 20 list - for example `KGM` for kilogram, `H87` for piece or `HUR` for hour.
This screen maintains the platform's copy of that published list, which is what unit pickers offer when billable items are set up and what is stamped on e-Invoice lines.
The list is not typed in by hand: you load and refresh it with one click from LHDN's published source, then fine-tune it by disabling the thousands of units nobody uses, leaving a short, relevant choice in pickers.
Staff come here when a unit is missing from a picker, when a description looks wrong, or after go-live to load the list for the first time.

## The screen at a glance

[Screenshot: e-Invoice Unit Types list]

- A status line at the top shows when the list was last synced, how many codes exist, and how many are active.
  If the list has never been loaded it says "Not synced yet" and invites you to click **Sync now**.
- The **Sync now** button (top right) loads or refreshes the whole list from LHDN.
- A search box filters the list as you type; it matches the code and the description.
- Each unit is a card showing the code and its description on the title line, e.g. `KGM` followed by `kilogram`.
  A code you added by hand that LHDN's list does not contain shows the sub-line "Manually added (not in the last LHDN sync)".
- Active units are listed first, then disabled ones, each group in code order.
- A status chip on the right shows **Active** (offered in pickers) or **Disabled** (hidden from pickers).
- Each card has an **Edit** button and a ⋮ menu holding **Enable** or **Disable**, and **Delete**.
- The **New code** button floats at the bottom right.

## Common tasks

### Load or refresh the list from LHDN (Sync now)

1. Click **Sync now**.
   The button reads "Syncing…" until it finishes; there is no confirmation step.
2. A green message confirms the result, e.g. "Synced 2162 e-Invoice unit types from LHDN."

What syncing does:

- It downloads LHDN's current published unit type list and adds every code that is missing.
- It is safe to repeat at any time: a unit you already have keeps its enabled or disabled status, and only its description and sync time are refreshed.
- New units arrive as Active.
- Units you added by hand are left untouched; they are simply marked as not being in the last sync.
- If LHDN's website cannot be reached, the system loads its own bundled copy of the list instead and tells you so: "LHDN site unreachable - loaded 2162 e-Invoice unit types from the bundled copy."

### Find a unit

- Type in the search box above the list.
  Matching is instant and covers the code and the description, so `kgm` or `kilo` both find kilogram.
- Click the ✕ in the search box, or the **Clear search** button on the "no matches" message, to see the full list again.

### Add a unit by hand

[Screenshot: New e-Invoice unit type dialog]

1. Click **New code**.
2. Type the **Code** exactly as published, e.g. `KGM`.
3. Type the **Description**, e.g. `kilogram`.
4. Click **Save**.

The unit appears in the list as Active, marked "Manually added", and is immediately offered in pickers.

### Edit a unit

[Screenshot: Edit e-Invoice unit type dialog]

1. Find the unit and click **Edit**.
2. Change the **Description**.
   The code itself is shown but cannot be changed: it is the value stamped on e-Invoices.
3. Click **Save**.

If you try to leave either dialog with unsaved changes (Cancel, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable / enable a unit

- Open the ⋮ menu on the card and click **Disable** to hide a unit from every unit picker in the app.
  The unit stays on this screen (marked **Disabled**), records that already use it keep working, and the next sync will not re-enable it.
- Open the ⋮ menu and click **Enable** to offer it in pickers again.

### Delete a unit

- Open the ⋮ menu on the card and click **Delete**.
  The unit is removed from the list immediately; there is no confirmation step, so use it only for a unit you added by mistake.
  A unit that LHDN still publishes will come back as Active on the next sync, so prefer **Disable** for units you simply do not want offered.

## Field reference

### Unit card (read-only)

| Field | What it shows |
| --- | --- |
| **Title line** | The unit code followed by its description. |
| **Sub-line** | "Manually added (not in the last LHDN sync)" for a unit that did not come from LHDN's list. |
| **Status chip** | **Active** means the unit appears in pickers; **Disabled** means it is hidden from them. |

### New code dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Code** | Yes | The UN/ECE unit code, e.g. `KGM`, `H87` or `XZZ`. It is the value stamped on e-Invoice lines and cannot be changed later. | Letters, digits and hyphens only, up to 20 characters; must not already exist. |
| **Description** | Yes | The unit's name, e.g. `kilogram`. | Up to 500 characters. |

### Edit code dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Code** | - | Shown for reference only. | Cannot be changed. |
| **Description** | Yes | The unit's name. | Up to 500 characters; the next sync overwrites it for units that came from the sync. |

## Tips & troubleshooting

- If you see "Code must be letters/digits only (UN/ECE codes like KGM, H87, XZZ)." under the Code box, remove spaces or punctuation from the code.
- If you see "e-Invoice unit type 'KGM' already exists." the unit is already in the list; search for it and edit or enable it instead.
- If you see "e-Invoice unit type not found." the unit you were working on no longer exists; refresh the list and try again.
- If you see "Failed to sync e-Invoice unit types.", "Failed to add e-Invoice unit type.", "Failed to update e-Invoice unit type." or "Failed to delete e-Invoice unit type." something went wrong on the server; try again, and contact support if it persists.
- A sync message that mentions the bundled copy means LHDN's site was unreachable at that moment; sync again later to pick up any newer units.
- The full list has over two thousand units, most of them irrelevant to a club; disabling the ones you never use keeps every unit picker short.

## Related options

- **e-Invoice Classification Codes**, **e-Invoice MSIC Codes**, **e-Invoice Tax Types**, **e-Invoice State Codes**, **e-Invoice Payment Methods** and **e-Invoice Document Types** (SaaS Administration → Reference data) - the other six LHDN code lists, maintained the same way.
