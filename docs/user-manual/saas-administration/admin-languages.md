# Languages

> **Where:** SaaS Administration → Reference data → Languages
>
> **Who can use it:** platform (system) administrators whose role includes the SaaS Administration module.
> The **Load defaults** and **New language** buttons need the Create permission, and **Edit** and **Enable/Disable** need the Edit permission; a role without a permission simply does not see that button.

## What this option is for

The Languages screen maintains the master list of languages the platform can be presented in.
It feeds every place where a language is chosen or translated: the languages a subscriber enables for its staff, the Translations boxes on the Countries screen, and the per-language names and descriptions of modules and menus.
You normally load the bundled default set once with one click, then disable the languages you do not intend to support or add one that is missing.
Staff come here when a language is missing from a picker or from a Translations section, when a language name looks wrong, or after go-live to load the list for the first time.

## The screen at a glance

[Screenshot: Languages list]

- A status line at the top shows how many languages exist and how many are active.
  If the list is empty it invites you to click **Load defaults** or **New language**.
- The **Load defaults** button (top right) adds the bundled language set.
- A search box filters the list as you type; it matches the language name and the language code.
- Each language is a card showing its name on the title line and its code (in capitals) on the sub-line, e.g. `Malay` / `MS`.
- Active languages are listed first, then disabled ones, each group in name order.
- A status chip on the right shows **Active** (offered in pickers and Translations sections) or **Disabled** (hidden from them).
- Each card has an **Edit** button and a ⋮ menu holding **Enable** or **Disable**.
- The **New language** button floats at the bottom right.

## Common tasks

### Load the default language set (Load defaults)

1. Click **Load defaults**.
2. A confirmation explains that the bundled set will be loaded, that languages you already have are kept as they are, and that only the missing ones are added.
   Click **Load defaults** to continue.
3. A green message confirms the result, e.g. "Loaded 42 default languages."

What loading does:

- It adds the 42 bundled languages - English, Malay, Chinese (Simplified and Traditional), Tamil, Hindi, Indonesian, Vietnamese, Thai and the major European and Asian languages - with their standard codes and names.
- It is safe to repeat: a language you already have keeps its enabled or disabled status, and only its name is refreshed.
- Newly added languages arrive as Active.

### Find a language

- Type in the search box above the list.
  Matching is instant and covers the name and the code, so `ms` or `malay` both find Malay.
- Click the ✕ in the search box, or the **Clear search** button on the "no matches" message, to see the full list again.

### Add a language by hand

[Screenshot: New language dialog]

1. Click **New language**.
2. Type the **Language code**, e.g. `en`, `ms` or `zh-tw`; it is stored in lower case whatever you type.
3. Type the **Name**, e.g. `English`.
4. Click **Save**.

The language appears in the list as Active and is immediately offered wherever languages are chosen.

### Edit a language

[Screenshot: Edit language dialog]

1. Find the language and click **Edit**.
2. Change the **Name**.
   The code is shown but cannot be changed: it identifies the language in every stored translation.
3. Click **Save**.

If you try to leave either dialog with unsaved changes (Cancel, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable / enable a language

- Open the ⋮ menu on the card and click **Disable** to hide a language from every language picker and from the Translations sections of the Countries and Modules & Menus screens.
  The language stays on this screen (marked **Disabled**) and translations already entered in it are kept.
- Open the ⋮ menu and click **Enable** to offer it again.

## Field reference

### Language card (read-only)

| Field | What it shows |
| --- | --- |
| **Title line** | The language name. |
| **Sub-line** | The language code in capitals, e.g. `ZH-TW`. |
| **Status chip** | **Active** means the language is offered in pickers and Translations sections; **Disabled** means it is hidden from them. |

### New language dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Language code** | Yes | The short standard code for the language, e.g. `en`, `ms`, `zh-tw`. It identifies the language in every translation and cannot be changed later. | Up to 10 characters; stored in lower case; must not already exist. |
| **Name** | Yes | The language's name as it should appear in pickers, e.g. `English`. | Up to 100 characters. |

### Edit language dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Language code** | - | Shown for reference only. | Cannot be changed. |
| **Name** | Yes | The language's name, e.g. `English`. | Up to 100 characters. |

## Tips & troubleshooting

- If you see "Language 'xx' already exists." that code is already in the list; search for it and edit or enable it instead of adding it again.
- If you see "Language not found." the language you were editing no longer exists; refresh the list and try again.
- If you see "Failed to load default languages.", "Failed to add language." or "Failed to update language." something went wrong on the server; try again, and contact support if it persists.
- If the Translations section on the Countries or Modules & Menus screen says no languages are configured, load the defaults here first.
- Keep the code conventional (the two-letter standard code, with a region suffix only where a script differs, as in `zh` and `zh-tw`), because the same code is used to look up translations everywhere.

## Related options

- **Countries** (SaaS Administration → Reference data → Countries) - the Translations section of its Edit dialog offers the languages active here.
- **Tenant Modules & Menus** and **Platform Modules & Menus** (SaaS Administration → Configuration) - their Translations sections offer the languages active here.
- **Currencies** (SaaS Administration → Reference data → Currencies) - the sibling reference table for currency pickers.
- **Account Languages** (System Setup, used by Tenant Admins) - each subscriber chooses which of the active languages its staff can use.
