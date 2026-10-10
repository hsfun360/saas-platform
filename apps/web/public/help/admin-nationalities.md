# Nationalities

> **Where:** System Setup → Nationalities
>
> **Who can use it:** users whose role includes the System Setup module (your organization's administrators, including the Tenant Admin).
> The New, Edit and Enable/Disable controls only appear when the role also has the matching Create and Edit permissions on this screen.

## What this option is for

The Nationalities screen maintains your organization's nationality list, for example Malaysian, Singaporean or British.
The list belongs to your whole subscription: every company you run shares the same nationalities, so an entry added here is available in all your companies.
Nationality is deliberately kept separate from the Countries list: where a person lives is not the same as their nationality, so you maintain exactly the nationalities your clubs need.
Nationalities are picked on member records in Membership Management, so staff come here when a new entry is needed, when a description needs correcting, or when an entry should no longer be offered.

## The screen at a glance

[Screenshot: Nationalities list]

- A count line at the top shows how many nationalities exist and how many are active.
- Each nationality is a card showing its code as the title and its description underneath.
- A status chip at the top right of each card shows **Active** or **Disabled**.
- Active nationalities are listed first, in alphabetical order of code, followed by the disabled ones.
- A search box filters the list as you type; it matches the code and the description.
- Each card has an **Edit** button and a **⋮** menu (More actions) holding **Enable** or **Disable**.
- The **New nationality** button sits at the bottom right of the screen.

## Common tasks

### Add a new nationality

[Screenshot: New nationality dialog]

1. Click **New nationality**.
2. Enter the **Nationality code**, for example `MAS`.
3. Optionally enter the **Description** that staff will recognise, for example `Malaysian`.
4. Click **Save**.

The nationality appears in the list as Active and becomes available in the nationality pickers of your companies straight away.

### Edit a nationality

1. Find the nationality (use the search box if the list is long) and click **Edit**.
2. Change the code or the description.
3. Click **Save**.

If you leave the dialog with unsaved changes (Cancel, ✕, Esc, or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable / enable a nationality

- Open the card's **⋮** menu and click **Disable** to retire an entry you no longer use.
  A disabled nationality disappears from the pickers in your companies, but records that already use it keep it.
- Open the **⋮** menu of a disabled nationality and click **Enable** to bring it back.

There is no delete: disabling is how you remove a nationality from use while keeping history intact.

## Field reference

### New nationality / Edit dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Nationality code** | Yes | A short code that identifies the nationality, e.g. `MAS`. | Up to 30 characters; must be unique within your organization. |
| **Description** | No | The nationality as it should read to staff, e.g. `Malaysian`. | Up to 200 characters. |

## Tips & troubleshooting

- If you see "Nationality code is required." fill in the code - it is the only mandatory field.
- If you see "Nationality 'X' already exists." another entry already uses that code; search the list (it may be disabled) and enable or edit it instead of creating a second one.
- If you see "Your account could not be resolved." your sign-in is not attached to a subscription; sign out and in again, or ask your administrator.
- Use short, stable codes and put the readable wording in the description, so the code can stay the same even if the wording changes.
- Prefer disabling over renaming a code that is already in use on member records.

## Related options

- **Races** (System Setup → Races) - a separate list; race and nationality are maintained independently.
- **Titles** (System Setup → Titles) - honorifics, which (unlike nationalities) can be tied to a country.
- **Memberships / Members** (Membership Management) - where nationalities are picked on member records.
