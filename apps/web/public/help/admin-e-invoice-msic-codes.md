# e-Invoice MSIC Codes

> **Where:** SaaS Administration → Reference data → e-Invoice MSIC Codes
>
> **Who can use it:** platform (system) administrators whose role includes the SaaS Administration module.
> The **Sync now** and **New code** buttons need the Create permission, **Edit** and **Enable/Disable** need the Edit permission, and **Delete** needs the Delete permission; a role without a permission simply does not see that button.

## What this option is for

Malaysia's e-Invoicing system (MyInvois, run by the tax authority LHDN) identifies every business by an MSIC code - the Malaysia Standard Industrial Classification 2008 code that describes the nature of its business activity, e.g. `93110` for the operation of sports facilities.
This screen maintains the platform's copy of LHDN's published MSIC code list, which is what the MSIC picker offers when the platform's own e-Invoice identity or a company's e-Invoice identity is set up.
The list is not typed in by hand: you load and refresh it with one click from LHDN's published source, then fine-tune it by disabling codes nobody needs or adding a code ahead of the next sync.
Staff come here when an MSIC code is missing from a picker, when a description looks out of date, or after go-live to load the list for the first time.

## The screen at a glance

[Screenshot: e-Invoice MSIC Codes list]

- A status line at the top shows when the list was last synced, how many codes exist, and how many are active.
  If the list has never been loaded it says "Not synced yet" and invites you to click **Sync now**.
- The **Sync now** button (top right) loads or refreshes the whole list from LHDN.
- A search box filters the list as you type; it matches the code, the description and the section name.
- Each code is a card showing the code and its description on the title line, e.g. `01111` followed by `Growing of maize`.
  The sub-line shows the MSIC section the code belongs to, as the section letter and its name, e.g. `C` followed by `Manufacturing`.
  A code you added by hand that LHDN's list does not contain also shows "Manually added (not in the last LHDN sync)".
- Active codes are listed first, then disabled ones, each group in code order.
- A status chip on the right shows **Active** (offered in pickers) or **Disabled** (hidden from pickers).
- Each card has an **Edit** button and a ⋮ menu holding **Enable** or **Disable**, and **Delete**.
- The **New code** button floats at the bottom right.

## Common tasks

### Load or refresh the list from LHDN (Sync now)

1. Click **Sync now**.
   The button reads "Syncing…" until it finishes; there is no confirmation step.
2. A green message confirms the result, e.g. "Synced 1174 e-Invoice MSIC codes from LHDN."

What syncing does:

- It downloads LHDN's current published MSIC list and adds every code that is missing.
- It is safe to repeat at any time: a code you already have keeps its enabled or disabled status, and only its description, section and sync time are refreshed.
- New codes arrive as Active.
- Codes you added by hand are left untouched; they are simply marked as not being in the last sync.
- If LHDN's website cannot be reached, the system loads its own bundled copy of the list instead and tells you so: "LHDN site unreachable - loaded 1174 e-Invoice MSIC codes from the bundled copy."

### Find a code

- Type in the search box above the list.
  Matching is instant and covers the code, the description and the section name, so `golf`, `93` or `recreation` all narrow the list.
- Click the ✕ in the search box, or the **Clear search** button on the "no matches" message, to see the full list again.

### Add a code by hand

[Screenshot: New e-Invoice MSIC code dialog]

1. Click **New code**.
2. Type the **Code** exactly as LHDN publishes it, e.g. `01111`.
3. Optionally type the **Section (A-U)** letter the code belongs to, e.g. `C`; the card then shows the section name.
4. Type the **Description**, e.g. `Growing of maize`.
5. Click **Save**.

The code appears in the list as Active, marked "Manually added", and is immediately offered in pickers.

### Edit a code

[Screenshot: Edit e-Invoice MSIC code dialog]

1. Find the code and click **Edit**.
2. Change the **Section (A-U)** or the **Description**.
   The code itself is shown but cannot be changed: it is the value stamped on e-Invoices.
3. Click **Save**.

If you try to leave either dialog with unsaved changes (Cancel, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable / enable a code

- Open the ⋮ menu on the card and click **Disable** to hide a code from every MSIC picker in the app.
  The code stays on this screen (marked **Disabled**), records that already use it keep working, and the next sync will not re-enable it.
- Open the ⋮ menu and click **Enable** to offer it in pickers again.

### Delete a code

- Open the ⋮ menu on the card and click **Delete**.
  The code is removed from the list immediately; there is no confirmation step, so use it only for a code you added by mistake.
  A code that LHDN still publishes will come back as Active on the next sync, so prefer **Disable** for codes you simply do not want offered.

## Field reference

### Code card (read-only)

| Field | What it shows |
| --- | --- |
| **Title line** | The MSIC code followed by its description. |
| **Sub-line** | The section letter and name (e.g. `C` Manufacturing), and "Manually added (not in the last LHDN sync)" for a code that did not come from LHDN's list. |
| **Status chip** | **Active** means the code appears in pickers; **Disabled** means it is hidden from them. |

### New code dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Code** | Yes | LHDN's MSIC code, e.g. `01111` (LHDN codes are 5 digits). It is the value stamped on e-Invoices and cannot be changed later. | Letters, digits and hyphens only, up to 20 characters; must not already exist. |
| **Section (A-U)** | No | The MSIC 2008 section letter the code falls under, e.g. `C` for Manufacturing or `R` for Arts, Entertainment and Recreation. The card shows the matching section name. | Up to 20 characters; a letter from A to U shows its section name. |
| **Description** | Yes | The business activity the code describes, in LHDN's wording, e.g. `Growing of maize`. | Up to 500 characters. |

### Edit code dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Code** | - | Shown for reference only. | Cannot be changed. |
| **Section (A-U)** | No | The MSIC section letter. | Up to 20 characters; the next sync overwrites it for codes that came from the sync. |
| **Description** | Yes | The business activity the code describes. | Up to 500 characters; the next sync overwrites it for codes that came from the sync. |

## Tips & troubleshooting

- If you see "Code must be letters/digits only (LHDN e-Invoice MSIC codes are 5 digits, e.g. 01111)." under the Code box, remove spaces or punctuation from the code.
- If you see "e-Invoice MSIC code '01111' already exists." the code is already in the list; search for it and edit or enable it instead.
- If you see "e-Invoice MSIC code not found." the code you were working on no longer exists; refresh the list and try again.
- If you see "Failed to sync e-Invoice MSIC codes.", "Failed to add e-Invoice MSIC code.", "Failed to update e-Invoice MSIC code." or "Failed to delete e-Invoice MSIC code." something went wrong on the server; try again, and contact support if it persists.
- A sync message that mentions the bundled copy means LHDN's site was unreachable at that moment; the bundled list is a recent snapshot, so sync again later to pick up any newer codes.
- The MSIC list is long (over a thousand codes), so search by section name or by a few digits of the code rather than scrolling.

## Related options

- **Platform Profile** (SaaS Administration → Configuration → Platform Profile) - its MSIC code is picked from the active codes maintained here, and the business activity description is filled in from the code.
- **e-Invoice Classification Codes**, **e-Invoice Tax Types**, **e-Invoice Unit Types**, **e-Invoice State Codes**, **e-Invoice Payment Methods** and **e-Invoice Document Types** (SaaS Administration → Reference data) - the other six LHDN code lists, maintained the same way.
