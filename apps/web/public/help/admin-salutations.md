# Salutations

> **Where:** System Setup → Salutations
>
> **Who can use it:** users whose role includes the System Setup module (your organization's administrators, including the Tenant Admin).
> The New, Edit and Enable/Disable controls only appear when the role also has the matching Create and Edit permissions on this screen.

## What this option is for

The Salutations screen maintains your organization's list of salutations - the short forms of address placed before a person's name, such as Mr, Mrs, Ms, Dr or Datuk.
The list belongs to your whole subscription: every company you run shares the same salutations, so a salutation added here is available in all your companies.
Salutations are picked on member records in Membership Management, so staff come here when a new form of address is needed, when a description needs correcting, or when a salutation should no longer be offered.

## The screen at a glance

[Screenshot: Salutations list]

- A count line at the top shows how many salutations exist and how many are active.
- Each salutation is a card showing its code as the title and its description underneath.
- A status chip at the top right of each card shows **Active** or **Disabled**.
- Active salutations are listed first, in alphabetical order of code, followed by the disabled ones.
- A search box filters the list as you type; it matches the code and the description.
- Each card has an **Edit** button and a **⋮** menu (More actions) holding **Enable** or **Disable**.
- The **New salutation** button sits at the bottom right of the screen.

## Common tasks

### Add a new salutation

[Screenshot: New salutation dialog]

1. Click **New salutation**.
2. Enter the **Salutation code**, for example `MR`.
3. Optionally enter the **Description** that staff will recognise, for example `Mr`.
4. Click **Save**.

The salutation appears in the list as Active and becomes available in the salutation pickers of your companies straight away.

### Edit a salutation

1. Find the salutation (use the search box if the list is long) and click **Edit**.
2. Change the code or the description.
3. Click **Save**.

If you leave the dialog with unsaved changes (Cancel, ✕, Esc, or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable / enable a salutation

- Open the card's **⋮** menu and click **Disable** to retire a salutation you no longer use.
  A disabled salutation disappears from the pickers in your companies, but records that already use it keep it.
- Open the **⋮** menu of a disabled salutation and click **Enable** to bring it back.

There is no delete: disabling is how you remove a salutation from use while keeping history intact.

## Field reference

### New salutation / Edit dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Salutation code** | Yes | A short code that identifies the salutation, e.g. `MR` or `DATUK`. | Up to 30 characters; must be unique within your organization. |
| **Description** | No | The salutation as it should read to staff, e.g. `Mr` or `Datuk`. | Up to 200 characters. |

## Tips & troubleshooting

- If you see "Salutation code is required." fill in the code - it is the only mandatory field.
- If you see "Salutation 'X' already exists." another salutation already uses that code; search the list (it may be disabled) and enable or edit it instead of creating a second one.
- If you see "Your account could not be resolved." your sign-in is not attached to a subscription; sign out and in again, or ask your administrator.
- Use short, stable codes and put the readable wording in the description, so the code can stay the same even if the wording changes.
- Prefer disabling over renaming a code that is already in use on member records.

## Related options

- **Titles** (System Setup → Titles) - honorifics such as Datuk or Tan Sri, which can be country-specific.
- **Nationalities**, **Races** (System Setup) - the other person-related lists used on member records.
- **Memberships / Members** (Membership Management) - where salutations are picked on member records.
