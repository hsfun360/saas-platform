# e-Invoice Classification Codes

> **Where:** SaaS Administration → Reference data → e-Invoice Classification Codes
>
> **Who can use it:** platform (system) administrators whose role includes the SaaS Administration module.
> The **Sync now** and **New code** buttons need the Create permission, **Edit** and **Enable/Disable** need the Edit permission, and **Delete** needs the Delete permission; a role without a permission simply does not see that button.

## What this option is for

Malaysia's e-Invoicing system (MyInvois, run by the tax authority LHDN) requires every line on an e-Invoice to carry a classification code that says what kind of goods or service is being billed.
This screen maintains the platform's copy of LHDN's published classification-code list, which is what every classification picker in the app offers when staff set up billable items.
The list is not typed in by hand: you load and refresh it with one click from LHDN's published source, then fine-tune it by disabling codes nobody needs or adding a code ahead of the next sync.
Staff come here when a classification is missing from a picker, when a description looks out of date, or after go-live to load the list for the first time.

## The screen at a glance

[Screenshot: e-Invoice Classification Codes list]

- A status line at the top shows when the list was last synced, how many codes exist, and how many are active.
  If the list has never been loaded it says "Not synced yet" and invites you to click **Sync now**.
- The **Sync now** button (top right) loads or refreshes the whole list from LHDN.
- A search box filters the list as you type; it matches the code and the description.
- Each code is a card showing the code and its description on the title line, e.g. `046` followed by `Motor vehicle`.
  A code you added by hand that LHDN's list does not contain shows the sub-line "Manually added (not in the last LHDN sync)".
- Active codes are listed first, then disabled ones, each group in code order.
- A status chip on the right shows **Active** (offered in pickers) or **Disabled** (hidden from pickers).
- Each card has an **Edit** button and a ⋮ menu holding **Enable** or **Disable**, and **Delete**.
- The **New code** button floats at the bottom right.

## Common tasks

### Load or refresh the list from LHDN (Sync now)

1. Click **Sync now**.
   The button reads "Syncing…" until it finishes; there is no confirmation step.
2. A green message confirms the result, e.g. "Synced 45 e-Invoice classification codes from LHDN."

What syncing does:

- It downloads LHDN's current published classification-code list and adds every code that is missing.
- It is safe to repeat at any time: a code you already have keeps its enabled or disabled status, and only its description and sync time are refreshed.
- New codes arrive as Active.
- Codes you added by hand are left untouched; they are simply marked as not being in the last sync.
- If LHDN's website cannot be reached, the system loads its own bundled copy of the list instead and tells you so: "LHDN site unreachable - loaded 45 e-Invoice classification codes from the bundled copy."

### Find a code

- Type in the search box above the list.
  Matching is instant and covers the code and the description.
- Click the ✕ in the search box, or the **Clear search** button on the "no matches" message, to see the full list again.

### Add a code by hand

[Screenshot: New e-Invoice classification code dialog]

1. Click **New code**.
2. Type the 3-digit **Code** exactly as LHDN publishes it, including leading zeros, e.g. `046`.
3. Type the **Description**, e.g. `Motor vehicle`.
4. Click **Save**.

The code appears in the list as Active, marked "Manually added", and is immediately offered in pickers.

### Edit a code

[Screenshot: Edit e-Invoice classification code dialog]

1. Find the code and click **Edit**.
2. Change the **Description**.
   The code itself is shown but cannot be changed: it is the value stamped on e-Invoices.
3. Click **Save**.

If you try to leave either dialog with unsaved changes (Cancel, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable / enable a code

- Open the ⋮ menu on the card and click **Disable** to hide a code from every classification picker in the app.
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
| **Title line** | The 3-digit code followed by its description. |
| **Sub-line** | "Manually added (not in the last LHDN sync)" for a code that did not come from LHDN's list. |
| **Status chip** | **Active** means the code appears in pickers; **Disabled** means it is hidden from them. |

### New code dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Code** | Yes | LHDN's 3-digit classification code, with leading zeros, e.g. `046`. It is the value stamped on e-Invoice lines and cannot be changed later. | Exactly 3 digits; must not already exist. |
| **Description** | Yes | What the code covers, in LHDN's wording, e.g. `Motor vehicle`. | Up to 500 characters. |

### Edit code dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Code** | - | Shown for reference only. | Cannot be changed. |
| **Description** | Yes | What the code covers. | Up to 500 characters; the next sync overwrites it with LHDN's wording for codes that came from the sync. |

## Tips & troubleshooting

- If you see "Code must be a 3-digit LHDN code (e.g. 046)." under the Code box, type the code with exactly three digits, including leading zeros.
- If you see "e-Invoice classification code '046' already exists." the code is already in the list; search for it and edit or enable it instead.
- If you see "e-Invoice classification code not found." the code you were working on no longer exists; refresh the list and try again.
- If you see "Failed to sync e-Invoice classification codes.", "Failed to add e-Invoice classification code.", "Failed to update e-Invoice classification code." or "Failed to delete e-Invoice classification code." something went wrong on the server; try again, and contact support if it persists.
- A sync message that mentions the bundled copy means LHDN's site was unreachable at that moment; the bundled list is a recent snapshot, so sync again later to pick up any newer codes.
- If a picker elsewhere in the app is missing a code, check here first: the code is probably marked **Disabled**, or the list has never been synced.

## Related options

- **e-Invoice MSIC Codes**, **e-Invoice Tax Types**, **e-Invoice Unit Types**, **e-Invoice State Codes**, **e-Invoice Payment Methods** and **e-Invoice Document Types** (SaaS Administration → Reference data) - the other six LHDN code lists, maintained the same way.
- **Platform Profile** (SaaS Administration → Configuration → Platform Profile) - the platform's own e-Invoice issuer identity.
