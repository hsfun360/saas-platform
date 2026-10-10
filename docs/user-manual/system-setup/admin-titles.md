# Titles

> **Where:** System Setup → Titles
>
> **Who can use it:** users whose role includes the System Setup module (your organization's administrators, including the Tenant Admin).
> The New, Edit and Enable/Disable controls only appear when the role also has the matching Create and Edit permissions on this screen.

## What this option is for

The Titles screen maintains your organization's honorifics - titles such as Datuk, Tan Sri, Tun, Sir or Prof that are placed before a person's name.
The list belongs to your whole subscription: every company you run shares the same titles.
Some honours only exist in one country (Datuk and Tan Sri in Malaysia, for example), so each title can optionally be tied to a country; a title with no country is universal and offered everywhere.
Titles are picked on member records in Membership Management, so staff come here when a new honorific is needed, when a description or country needs correcting, or when a title should no longer be offered.

## The screen at a glance

[Screenshot: Titles list]

- A count line at the top shows how many titles exist and how many are active.
- Each title is a card showing the country flag (if the title is country-specific) and the code as the title, with the description and the country name (or **Any country**) underneath.
- A status chip at the top right of each card shows **Active** or **Disabled**.
- Active titles are listed first, in alphabetical order of code, followed by the disabled ones.
- A search box filters the list as you type; it matches the code, the description and the country name.
- Each card has an **Edit** button and a **⋮** menu (More actions) holding **Enable** or **Disable**.
- The **New title** button sits at the bottom right of the screen.

## Common tasks

### Add a new title

[Screenshot: New title dialog]

1. Click **New title**.
2. Enter the **Title code**, for example `DATUK`.
3. Pick the **Country** if the honour belongs to one country, or leave it as **Any country (universal)**.
   Type a few letters to filter the country list, then choose from it.
4. Optionally enter the **Description** that staff will recognise, for example `Datuk`.
5. Click **Save**.

The title appears in the list as Active and becomes available in the title pickers straight away; a country-specific title is offered together with the universal ones for that country.

### Edit a title

1. Find the title (use the search box if the list is long) and click **Edit**.
2. Change the code, the country or the description.
3. Click **Save**.

If you leave the dialog with unsaved changes (Cancel, ✕, Esc, or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable / enable a title

- Open the card's **⋮** menu and click **Disable** to retire a title you no longer use.
  A disabled title disappears from the pickers in your companies, but records that already use it keep it.
- Open the **⋮** menu of a disabled title and click **Enable** to bring it back.

There is no delete: disabling is how you remove a title from use while keeping history intact.

## Field reference

### New title / Edit dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Title code** | Yes | A short code that identifies the honorific, e.g. `DATUK` or `SIR`. | Up to 30 characters; must be unique within your organization. |
| **Country** | No | The country the honour belongs to, e.g. Malaysia for Datuk. Leave as **Any country (universal)** for titles used everywhere, such as Sir or Prof. | Choose from the list of active countries; typing filters the list and only a listed country can be chosen. |
| **Description** | No | The title as it should read to staff, e.g. `Datuk`. | Up to 200 characters. |

## Tips & troubleshooting

- If you see "Title code is required." fill in the code - it is the only mandatory field.
- If you see "Title 'X' already exists." another title already uses that code; search the list (it may be disabled) and enable or edit it instead of creating a second one.
- If you see "Your account could not be resolved." your sign-in is not attached to a subscription; sign out and in again, or ask your administrator.
- If the country you need is missing from the picker, it is not active on the Countries list; ask your platform administrator to enable it.
- Tie a title to a country only when the honour genuinely is country-specific; universal titles reach every company regardless of where it operates.

## Related options

- **Salutations** (System Setup → Salutations) - everyday forms of address (Mr, Mrs, Dr), maintained separately from honorifics.
- **Countries** (SaaS Administration → Countries) - the active countries offered in the Country picker.
- **Memberships / Members** (Membership Management) - where titles are picked on member records.
