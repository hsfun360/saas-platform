# Countries

> **Where:** SaaS Administration → Reference data → Countries
> **Who can use it:** users whose role includes the SaaS Administration module (System Administrators).

## What this option is for

The Countries screen maintains the master list of countries that the whole system relies on.
Every country picker in the app - for example the country of a company, the country a public holiday belongs to, or the country a tax scheme applies to - offers exactly the countries that are active on this screen.
The list is not typed in by hand: you load and refresh it with one click from a maintained worldwide dataset, then fine-tune it by disabling countries you do not serve, correcting dial codes, and editing translated country names.
Staff come here when a country is missing from a picker, when a country name or dial code looks wrong, or after go-live to load the list for the first time.

## The screen at a glance

[Screenshot: Countries list]

- A status line at the top shows when the list was last synced, how many countries exist, and how many are active.
  If the list has never been loaded it says "Not synced yet" and invites you to click **Sync now**.
- The **Sync now** button (top right) loads or refreshes the whole list from the worldwide dataset.
- A search box filters the list as you type; it matches the country name and the 2-letter and 3-letter country codes.
- Each country is a card showing its flag, its name, and a sub-line with the 2-letter code, the 3-letter code, and the dial code (e.g. `MY · MYS · +60`).
- A status chip on the right shows **Active** (offered in pickers) or **Disabled** (hidden from pickers).
- Each card has an **Edit** button, plus a red **Disable** or green **Enable** button depending on the country's current status.
- A special entry called **Others** is always present and active; it is the choice for a company whose country is not in the list.

## Common tasks

### Load or refresh the country list (Sync now)

1. Click **Sync now**.
2. Wait while the system fetches the latest country data; the button reads "Syncing…" until it finishes.
3. A green message confirms the result, e.g. "Synced 251 countries across 37 language(s)."

What syncing does:

- It loads every country with its official codes, flag, dial code, and its name translated in about 37 languages.
- It is safe to repeat at any time: countries you have disabled stay disabled, and dial codes you set by hand for countries the built-in list does not cover are kept.
- New countries added by the sync arrive as Active.
- The **Others** entry is always included so pickers can offer it.

You normally sync once at setup and then only when you want to pick up updated country data.

### Find a country

- Type in the search box above the list.
  Matching is instant and covers the name, the 2-letter code, and the 3-letter code, so `my`, `mys`, or `malay` all find Malaysia.
- Click the ✕ in the search box, or the **Clear search** button on the "no matches" message, to see the full list again.

### Edit a country (dial code and translations)

[Screenshot: Edit country dialog]

1. Find the country and click **Edit**.
2. Adjust the **Dial code** if needed, e.g. `+60`.
3. Under **Translations**, type the country's name in each language your platform offers; leave a language blank to clear that translation.
4. Click **Save**.

Notes:

- The country's codes and its position in the list come from the sync and cannot be edited here.
- The languages offered in the Translations section come from the Languages screen.
  If no languages are configured yet, the dialog tells you to load defaults on the Languages screen first.
- Changing the English translation also changes the name shown for this country in lists and pickers throughout the system.
- If you try to leave the dialog with unsaved changes (Cancel, ✕, Esc, or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable / enable a country

- Click the red **Disable** button to remove a country from every country picker in the app.
  The country stays on this screen (marked **Disabled**) and any records that already use it keep working; it just cannot be picked for new records.
- Click the green **Enable** button to offer it in pickers again.
- Your enable/disable choices survive future syncs.

Disabling is how you keep pickers short and relevant, e.g. only the countries your subscribers actually operate in.

## Field reference

### Country card (read-only)

| Field | What it shows |
| --- | --- |
| **Flag and name** | The country's flag and display name (the English translation). |
| **Codes line** | The 2-letter code, the 3-letter code, and the dial code when one is set, e.g. `MY · MYS · +60`. |
| **Status chip** | **Active** means the country appears in pickers; **Disabled** means it is hidden from them. |

### Edit dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Dial code** | No | The international phone calling code for this country, e.g. `+60`. It is shown on the country card and used wherever the system needs a country's calling code. | Up to 8 characters. If you type it without the leading `+`, the system adds it for you. Leave it blank to remove the dial code. |
| **Translations (one box per language)** | No | The country's name in that language, e.g. `马来西亚` for Chinese. These localized names let the system show country names in each user's language. | Up to 100 characters each. Leave a box blank to clear that translation. The English translation doubles as the display name in lists and pickers. |

## Tips & troubleshooting

- If you see "Could not fetch country data from the source. Try again shortly." the worldwide dataset could not be reached at that moment; wait a little and click **Sync now** again.
- If you see "Country not found." the country you were editing no longer exists; refresh the list and try again.
- If you see "Failed to sync countries." or "Failed to update country." something went wrong on the server; try again, and contact support if it persists.
- If a picker elsewhere in the app is missing a country, check here first: the country is probably marked **Disabled**, or the list has never been synced.
- If a subscriber operates in a country you cannot find even after a sync, leave the special **Others** entry active so their company can still be registered.
- Prefer disabling over expecting removal: countries cannot be deleted, and disabling keeps history intact while hiding the country from new choices.
- The Translations section only shows languages that are active on the Languages screen (plus any language that already has a translation), so configure Languages before doing translation work here.

## Related options

- **Languages** (SaaS Administration → Reference data → Languages) - defines which languages appear in the Translations section of the Edit dialog.
- **Currencies** (SaaS Administration → Reference data → Currencies) - the sibling reference table for currency pickers.
- **Companies** (System Setup → Companies) - each company's country is picked from the active countries maintained here.
- **Public Holidays** (System Setup → Public Holidays) - holidays are scoped by country, using the countries maintained here.
- **Tax Setup** - tax schemes are country-bound and show the country flag maintained here.
