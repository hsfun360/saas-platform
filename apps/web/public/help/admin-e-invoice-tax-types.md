# e-Invoice Tax Types

> **Where:** SaaS Administration → Reference data → e-Invoice Tax Types
>
> **Who can use it:** platform (system) administrators whose role includes the SaaS Administration module.
> The **Sync now** and **New code** buttons need the Create permission, **Edit** and **Enable/Disable** need the Edit permission, and **Delete** needs the Delete permission; a role without a permission simply does not see that button.

## What this option is for

Malaysia's e-Invoicing system (MyInvois, run by the tax authority LHDN) requires each tax amount on an e-Invoice to be labelled with one of LHDN's tax type codes - `01` to `06` for Sales Tax, Service Tax and the other statutory taxes, and `E` for a tax exemption.
This screen maintains the platform's copy of that published list, which is stamped on e-Invoice documents when they are prepared.
It is separate from the Platform Tax and Tax Setup screens: those define the schemes and rates that calculate tax, while this list only supplies the official LHDN label that goes on the e-Invoice.
The list is not typed in by hand: you load and refresh it with one click from LHDN's published source, then fine-tune it by disabling codes nobody needs or adding a code ahead of the next sync.

## The screen at a glance

[Screenshot: e-Invoice Tax Types list]

- A status line at the top shows when the list was last synced, how many codes exist, and how many are active.
  If the list has never been loaded it says "Not synced yet" and invites you to click **Sync now**.
- The **Sync now** button (top right) loads or refreshes the whole list from LHDN.
- A search box filters the list as you type; it matches the code and the description.
- Each code is a card showing the code and its description on the title line, e.g. `01` followed by `Sales Tax`.
  A code you added by hand that LHDN's list does not contain shows the sub-line "Manually added (not in the last LHDN sync)".
- Active codes are listed first, then disabled ones, each group in code order.
- A status chip on the right shows **Active** (offered when e-Invoices are prepared) or **Disabled** (hidden).
- Each card has an **Edit** button and a ⋮ menu holding **Enable** or **Disable**, and **Delete**.
- The **New code** button floats at the bottom right.

## Common tasks

### Load or refresh the list from LHDN (Sync now)

1. Click **Sync now**.
   The button reads "Syncing…" until it finishes; there is no confirmation step.
2. A green message confirms the result, e.g. "Synced 7 e-Invoice tax types from LHDN."

What syncing does:

- It downloads LHDN's current published tax type list and adds every code that is missing.
- It is safe to repeat at any time: a code you already have keeps its enabled or disabled status, and only its description and sync time are refreshed.
- New codes arrive as Active.
- Codes you added by hand are left untouched; they are simply marked as not being in the last sync.
- If LHDN's website cannot be reached, the system loads its own bundled copy of the list instead and tells you so: "LHDN site unreachable - loaded 7 e-Invoice tax types from the bundled copy."

### Find a code

- Type in the search box above the list; matching is instant and covers the code and the description.
- Click the ✕ in the search box, or the **Clear search** button on the "no matches" message, to see the full list again.

### Add a code by hand

[Screenshot: New e-Invoice tax type dialog]

1. Click **New code**.
2. Type the **Code** exactly as LHDN publishes it, e.g. `07`.
3. Type the **Description**, e.g. `Sales Tax`.
4. Click **Save**.

The code appears in the list as Active and marked "Manually added".

### Edit a code

[Screenshot: Edit e-Invoice tax type dialog]

1. Find the code and click **Edit**.
2. Change the **Description**.
   The code itself is shown but cannot be changed: it is the value stamped on e-Invoices.
3. Click **Save**.

If you try to leave either dialog with unsaved changes (Cancel, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable / enable a code

- Open the ⋮ menu on the card and click **Disable** to stop a tax type being offered.
  The code stays on this screen (marked **Disabled**), documents that already carry it are unaffected, and the next sync will not re-enable it.
- Open the ⋮ menu and click **Enable** to offer it again.

### Delete a code

- Open the ⋮ menu on the card and click **Delete**.
  The code is removed from the list immediately; there is no confirmation step, so use it only for a code you added by mistake.
  A code that LHDN still publishes will come back as Active on the next sync, so prefer **Disable** for codes you simply do not want offered.

## Field reference

### Code card (read-only)

| Field | What it shows |
| --- | --- |
| **Title line** | The tax type code followed by its description. |
| **Sub-line** | "Manually added (not in the last LHDN sync)" for a code that did not come from LHDN's list. |
| **Status chip** | **Active** means the tax type is offered; **Disabled** means it is hidden. |

### New code dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Code** | Yes | LHDN's tax type code, e.g. `01` (LHDN publishes `01` to `06` and `E`). It is the value stamped on e-Invoices and cannot be changed later. | Letters, digits and hyphens only, up to 20 characters; must not already exist. |
| **Description** | Yes | The tax the code stands for, in LHDN's wording, e.g. `Sales Tax`. | Up to 500 characters. |

### Edit code dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Code** | - | Shown for reference only. | Cannot be changed. |
| **Description** | Yes | The tax the code stands for. | Up to 500 characters; the next sync overwrites it for codes that came from the sync. |

## Tips & troubleshooting

- If you see "Code must be letters/digits only (LHDN tax types are '01'-'06' or 'E')." under the Code box, remove spaces or punctuation from the code.
- If you see "e-Invoice tax type '01' already exists." the code is already in the list; search for it and edit or enable it instead.
- If you see "e-Invoice tax type not found." the code you were working on no longer exists; refresh the list and try again.
- If you see "Failed to sync e-Invoice tax types.", "Failed to add e-Invoice tax type.", "Failed to update e-Invoice tax type." or "Failed to delete e-Invoice tax type." something went wrong on the server; try again, and contact support if it persists.
- A sync message that mentions the bundled copy means LHDN's site was unreachable at that moment; sync again later to pick up any newer codes.
- Do not confuse these codes with tax schemes: the rate a customer is charged comes from Platform Tax or Tax Setup, and this list only labels the result for LHDN.

## Related options

- **Platform Tax** (SaaS Administration → Configuration → Platform Tax) - the schemes and rates that actually calculate the platform's tax.
- **e-Invoice Classification Codes**, **e-Invoice MSIC Codes**, **e-Invoice Unit Types**, **e-Invoice State Codes**, **e-Invoice Payment Methods** and **e-Invoice Document Types** (SaaS Administration → Reference data) - the other six LHDN code lists, maintained the same way.
