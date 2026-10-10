# Races

> **Where:** System Setup → Races
>
> **Who can use it:** users whose role includes the System Setup module (your organization's administrators, including the Tenant Admin).
> The New, Edit and Enable/Disable controls only appear when the role also has the matching Create and Edit permissions on this screen.

## What this option is for

The Races screen maintains your organization's race / ethnicity list, for example Malay, Chinese, Indian or Others.
The list belongs to your whole subscription: every company you run shares the same races, so an entry added here is available in all your companies.
Races are picked on member records in Membership Management, so staff come here when a new entry is needed, when a description needs correcting, or when an entry should no longer be offered.

## The screen at a glance

[Screenshot: Races list]

- A count line at the top shows how many races exist and how many are active.
- Each race is a card showing its code as the title and its description underneath.
- A status chip at the top right of each card shows **Active** or **Disabled**.
- Active races are listed first, in alphabetical order of code, followed by the disabled ones.
- A search box filters the list as you type; it matches the code and the description.
- Each card has an **Edit** button and a **⋮** menu (More actions) holding **Enable** or **Disable**.
- The **New race** button sits at the bottom right of the screen.

## Common tasks

### Add a new race

[Screenshot: New race dialog]

1. Click **New race**.
2. Enter the **Race code**, for example `MAL`.
3. Optionally enter the **Description** that staff will recognise, for example `Malay`.
4. Click **Save**.

The race appears in the list as Active and becomes available in the race pickers of your companies straight away.

### Edit a race

1. Find the race (use the search box if the list is long) and click **Edit**.
2. Change the code or the description.
3. Click **Save**.

If you leave the dialog with unsaved changes (Cancel, ✕, Esc, or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable / enable a race

- Open the card's **⋮** menu and click **Disable** to retire an entry you no longer use.
  A disabled race disappears from the pickers in your companies, but records that already use it keep it.
- Open the **⋮** menu of a disabled race and click **Enable** to bring it back.

There is no delete: disabling is how you remove a race from use while keeping history intact.

## Field reference

### New race / Edit dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Race code** | Yes | A short code that identifies the race, e.g. `MAL` or `CHN`. | Up to 30 characters; must be unique within your organization. |
| **Description** | No | The race as it should read to staff, e.g. `Malay` or `Chinese`. | Up to 200 characters. |

## Tips & troubleshooting

- If you see "Race code is required." fill in the code - it is the only mandatory field.
- If you see "Race 'X' already exists." another entry already uses that code; search the list (it may be disabled) and enable or edit it instead of creating a second one.
- If you see "Your account could not be resolved." your sign-in is not attached to a subscription; sign out and in again, or ask your administrator.
- Use short, stable codes and put the readable wording in the description, so the code can stay the same even if the wording changes.
- Prefer disabling over renaming a code that is already in use on member records.

## Related options

- **Nationalities** (System Setup → Nationalities) - a separate list; nationality is not the same as race and the two are maintained independently.
- **Salutations**, **Titles** (System Setup) - the other person-related lists used on member records.
- **Memberships / Members** (Membership Management) - where races are picked on member records.
