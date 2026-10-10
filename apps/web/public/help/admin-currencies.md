# Currencies

> **Where:** SaaS Administration → Reference data → Currencies
>
> **Who can use it:** platform (system) administrators whose role includes the SaaS Administration module.
> The **Load defaults** and **New currency** buttons need the Create permission, and **Edit** and **Enable/Disable** need the Edit permission; a role without a permission simply does not see that button.

## What this option is for

The Currencies screen maintains the master list of world currencies that the whole system relies on.
Every currency picker in the app - the base currency on the Platform Profile, the currencies a subscriber enables for its companies, and the currency of a receivable account in another currency - offers exactly the currencies that are active on this screen.
You normally load the standard worldwide set once with one click, then fine-tune it by disabling currencies nobody uses, correcting a symbol, or adding a currency the standard set does not cover.
Staff come here when a currency is missing from a picker, when a symbol or decimal-places setting looks wrong, or after go-live to load the list for the first time.

## The screen at a glance

[Screenshot: Currencies list]

- A status line at the top shows how many currencies exist and how many are active.
  If the list is empty it invites you to click **Load defaults** or **New currency**.
- The **Load defaults** button (top right) adds the standard worldwide currency set.
- A search box filters the list as you type; it matches the currency name and the 3-letter code.
- Each currency is a card showing its code and name on the title line, and a sub-line with the symbol, the number of decimal places, and the numeric code when one is known, e.g. `$ · 2 decimals · No. 840`.
- Active currencies are listed first, then disabled ones, each group in code order.
- A status chip on the right shows **Active** (offered in pickers) or **Disabled** (hidden from pickers).
- Each card has an **Edit** button and a ⋮ menu holding **Enable** or **Disable**.
- The **New currency** button floats at the bottom right.

## Common tasks

### Load the standard currency set (Load defaults)

1. Click **Load defaults**.
2. A confirmation explains that the standard set will be loaded, that currencies you already have are kept as they are, and that only the missing ones are added.
   Click **Load defaults** to continue.
3. A green message confirms the result, e.g. "Loaded 154 ISO 4217 currencies."

What loading does:

- It adds the 154 bundled world currencies with their codes, names, symbols, numeric codes and decimal places.
- It is safe to repeat: a currency you already have keeps its enabled or disabled status, and only its name, symbol, numeric code and decimal places are refreshed from the standard set.
- Newly added currencies arrive as Active.

### Find a currency

- Type in the search box above the list.
  Matching is instant and covers the name and the 3-letter code, so `myr`, `ringgit` or `malay` all find the Malaysian Ringgit.
- Click the ✕ in the search box, or the **Clear search** button on the "no matches" message, to see the full list again.

### Add a currency by hand

[Screenshot: New currency dialog]

1. Click **New currency**.
2. Type the 3-letter **Code (ISO 4217)**, e.g. `USD`; it is stored in capitals whatever you type.
3. Optionally type the **Numeric code**, e.g. `840`.
4. Type the **Name**, e.g. `US Dollar`.
5. Optionally type the **Symbol**, e.g. `$`, and adjust **Decimal places** (2 unless you change it).
6. Click **Save**.

The currency appears in the list as Active and is immediately offered in pickers.

### Edit a currency

[Screenshot: Edit currency dialog]

1. Find the currency and click **Edit**.
2. Change the **Name**, **Symbol** or **Decimal places**.
   The code is shown but cannot be changed: it identifies the currency everywhere it is already used.
3. Click **Save**.

If you try to leave either dialog with unsaved changes (Cancel, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable / enable a currency

- Open the ⋮ menu on the card and click **Disable** to remove a currency from every currency picker in the app.
  The currency stays on this screen (marked **Disabled**) and any records that already use it keep working; it just cannot be picked for new records.
- Open the ⋮ menu and click **Enable** to offer it in pickers again.

Disabling is how you keep pickers short and relevant, e.g. only the currencies your subscribers actually bill in.

## Field reference

### Currency card (read-only)

| Field | What it shows |
| --- | --- |
| **Title line** | The 3-letter code followed by the currency name. |
| **Sub-line** | The symbol when set, the number of decimal places, and the numeric code when set. |
| **Status chip** | **Active** means the currency appears in pickers; **Disabled** means it is hidden from them. |

### New currency dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Code (ISO 4217)** | Yes | The international 3-letter currency code, e.g. `USD`. It identifies the currency everywhere in the system and cannot be changed later. | Exactly 3 letters; stored in capitals; must not already exist. |
| **Numeric code** | No | The international 3-digit number for the currency, e.g. `840`. Shown on the card for reference. | A whole number from 0 to 999. |
| **Name** | Yes | The currency's full name as it should appear in pickers, e.g. `US Dollar`. | Up to 100 characters. |
| **Symbol** | No | The sign shown beside amounts, e.g. `$` or `RM`. | Up to 8 characters. |
| **Decimal places** | No | How many decimal places amounts in this currency carry, e.g. `2` for dollars and cents, `0` for a currency with no minor unit. | A whole number from 0 to 4; 2 when left blank. |

### Edit currency dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Code (ISO 4217)** | - | Shown for reference only. | Cannot be changed. |
| **Name** | Yes | The currency's full name, e.g. `US Dollar`. | Up to 100 characters. |
| **Symbol** | No | The sign shown beside amounts, e.g. `$`. | Up to 8 characters; clear it to remove the symbol. |
| **Decimal places** | No | How many decimal places amounts in this currency carry. | A whole number from 0 to 4; 2 when left blank. |

## Tips & troubleshooting

- If you see "Code must be a 3-letter ISO 4217 code (e.g. USD)." under the Code box, the code has the wrong length or contains something other than letters.
- If you see "Currency 'XXX' already exists." that code is already in the list; search for it and edit or enable it instead of adding it again.
- If you see "Currency not found." the currency you were editing no longer exists; refresh the list and try again.
- If you see "Failed to load default currencies.", "Failed to add currency." or "Failed to update currency." something went wrong on the server; try again, and contact support if it persists.
- If a picker elsewhere in the app is missing a currency, check here first: the currency is probably marked **Disabled**, or the standard set has never been loaded.
- Prefer disabling over expecting removal: disabling keeps history intact while hiding the currency from new choices.

## Related options

- **Countries** (SaaS Administration → Reference data → Countries) - the sibling reference table for country pickers.
- **Languages** (SaaS Administration → Reference data → Languages) - the sibling reference table for language pickers.
- **Platform Profile** (SaaS Administration → Configuration → Platform Profile) - its Base currency is picked from the active currencies maintained here.
- **Account Currencies** (System Setup, used by Tenant Admins) - each subscriber chooses which of the active currencies its companies use.
