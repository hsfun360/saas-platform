# Industry Types

> **Where:** System Setup → Industry Types
>
> **Who can use it:** users whose role includes the System Setup module (your organization's administrators, including the Tenant Admin).
> The New, Edit and Enable/Disable controls only appear when the role also has the matching Create and Edit permissions on this screen.

## What this option is for

The Industry Types screen maintains your organization's industry classification - the business sectors you want to record against members and corporate memberships, for example Food & Beverage, Banking or Manufacturing.
The list belongs to your whole subscription: every company you run shares the same industry types, so an entry added here is available in all your companies.
Industry types are picked on membership and member records in Membership Management, so staff come here when a new sector is needed, when a description needs correcting, or when a sector should no longer be offered.

## The screen at a glance

[Screenshot: Industry Types list]

- A count line at the top shows how many industry types exist and how many are active.
- Each industry type is a card showing its code as the title and its description underneath.
- A status chip at the top right of each card shows **Active** or **Disabled**.
- Active industry types are listed first, in alphabetical order of code, followed by the disabled ones.
- A search box filters the list as you type; it matches the code and the description.
- Each card has an **Edit** button and a **⋮** menu (More actions) holding **Enable** or **Disable**.
- The **New industry type** button sits at the bottom right of the screen.

## Common tasks

### Add a new industry type

[Screenshot: New industry type dialog]

1. Click **New industry type**.
2. Enter the **Industry type code**, for example `FNB`.
3. Optionally enter the **Description** that staff will recognise, for example `Food & Beverage`.
4. Click **Save**.

The industry type appears in the list as Active and becomes available in the industry pickers of your companies straight away.

### Edit an industry type

1. Find the industry type (use the search box if the list is long) and click **Edit**.
2. Change the code or the description.
3. Click **Save**.

If you leave the dialog with unsaved changes (Cancel, ✕, Esc, or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable / enable an industry type

- Open the card's **⋮** menu and click **Disable** to retire an entry you no longer use.
  A disabled industry type disappears from the pickers in your companies, but records that already use it keep it.
- Open the **⋮** menu of a disabled industry type and click **Enable** to bring it back.

There is no delete: disabling is how you remove an industry type from use while keeping history intact.

## Field reference

### New industry type / Edit dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Industry type code** | Yes | A short code that identifies the sector, e.g. `FNB`. | Up to 30 characters; must be unique within your organization. |
| **Description** | No | The sector as it should read to staff, e.g. `Food & Beverage`. | Up to 200 characters. |

## Tips & troubleshooting

- If you see "Industry type code is required." fill in the code - it is the only mandatory field.
- If you see "Industry type 'X' already exists." another entry already uses that code; search the list (it may be disabled) and enable or edit it instead of creating a second one.
- If you see "Your account could not be resolved." your sign-in is not attached to a subscription; sign out and in again, or ask your administrator.
- Use short, stable codes and put the readable wording in the description, so the code can stay the same even if the wording changes.
- Prefer disabling over renaming a code that is already in use on membership records.

## Related options

- **Memberships / Members** (Membership Management) - where industry types are picked on corporate memberships and member records.
- **Business Insights** (Membership Management) - analyses that can group members by the sectors you define here.
