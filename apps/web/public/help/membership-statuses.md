# Membership Status

> **Where:** Membership Management → Membership Status
>
> **Who can use it:** users whose role includes the Membership Management module.
> Your role's Create, Edit and Delete permissions decide which buttons you see; a button you are not allowed to use is simply not shown.

## What this option is for

The Membership Status screen maintains the list of statuses a member or membership can be in at your club - for example Active, Provisional, Suspended, Resigned or Deceased.
Each status belongs to a fixed lifecycle class and carries two controls that the rest of the system obeys: what happens when a member in this status tries to register or book (Action control), and what happens when they charge an expense to their account at settlement (Charge control).
Each status also has a colour, which is shown as a dot beside the status name on the Memberships and Members screens and in the Business Insights charts.
Staff come here when setting up a new club, when the club introduces a new status, or when a status should start warning or barring members.
Statuses defined here are picked on Membership Types (as the default status of a new member), on the Memberships and Members screens, and on the Standing charges of a Membership Type.

## The screen at a glance

[Screenshot: Membership Status list]

- A count line reads e.g. "8 statuses, 7 active".
- A search box filters the list as you type, matching the status name, its description and its class.
- Each status is a card: a colour swatch and the status name as the title, then a sub-line with the class, the Action and Charge controls and the description.
- A status chip top-right shows **Active** or **Disabled**.
- Active statuses are listed first, then disabled ones, each group in alphabetical order.
- Each card has an **Edit** button and a ⋮ menu holding **Enable** or **Disable**.
- The **New status** button floats at the bottom right of the screen.
- When the company has no statuses yet, the empty list offers **Copy from another company**.

## Common tasks

### Add a new status

[Screenshot: New membership status dialog]

1. Click **New status**.
2. Enter the **Membership status** name and pick its **Status class**.
3. Optionally add a **Description**.
4. Pick the **Action control** and **Charge control** the system should apply to members in this status.
5. Pick a **Status colour** with the colour picker, or type a hex value such as `#2563eb`.
6. Click **Save**.

The new status appears in the list and becomes available in every status picker.

### Edit a status

1. Find the status (use the search box if the list is long) and click **Edit**.
2. Change what you need - every field, including the name, can be changed.
3. Click **Save**.

If you leave the dialog with unsaved changes (Cancel, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.
Renaming a status renames it everywhere it is already used; the members carrying it are not affected otherwise.

### Disable / enable a status

- Open the card's ⋮ menu and click **Disable** to retire a status you no longer use.
  A disabled status stays on the members that already carry it and in history, but no longer appears in pickers.
- Open the ⋮ menu of a disabled status and click **Enable** to bring it back.

Statuses are never deleted, because members may already carry them.

### Copy statuses from another company (first-time setup only)

[Screenshot: Copy membership statuses dialog]

Use this when a new company in your subscription should start with the statuses of an existing one.

1. On the empty list, click **Copy from another company**.
2. In **Copy from**, pick the company to copy from; the number in brackets is how many active statuses it has.
3. Every status of that company is pre-ticked; untick any you do not want.
4. Click **Copy N statuses** - the button states how many will be copied.

The copies belong to your company from then on and can be edited freely.
Only active statuses of the source company are offered, and copying is available only while your company has no statuses at all.

## Field reference

### New membership status / Edit dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Membership status** | Yes | The status name as staff will see it in pickers and on member cards, e.g. `Active`, `Suspended`. | Up to 255 characters; must be unique within the company. |
| **Status class** | Yes | The lifecycle class this status represents: Active, Provisional, Resigned, Decease, Terminate, Absent, Suspend, Defaulter, Expired or Active (Absent). Business Insights counts Active and Active (Absent) classes as active members. | One of the fixed classes. |
| **Description** | No | A short note explaining when the status is used, e.g. `Awaiting committee approval`. | Up to 255 characters. |
| **Action control** | Yes | What the system does when a member in this status registers or books (golf, facilities, check-in): **Allow** proceeds, **Warning** proceeds but alerts the operator, **Barred** refuses. | One of the three values. |
| **Charge control** | Yes | What the system does when a member in this status charges to their account at settlement: **Allow** posts, **Warning** alerts the operator but still posts, **Barred** refuses the charge. Cash or card settlement is never checked. Membership fee billing is never blocked by this control. | One of the three values. |
| **Status colour** | No | The colour shown as the status dot on member cards and in the Business Insights status chart. Use the picker or type a hex value. | A hex colour such as `#22c55e`; new statuses start black. |

### Copy membership statuses dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Copy from** | Yes | The company in your subscription whose statuses you want; the list only offers companies that have active statuses. | Must be another company in the same subscription. |
| **Statuses to copy** | Yes | Tick the statuses to copy; all are ticked by default. | At least one. |

## Tips & troubleshooting

- If you see "Membership status 'X' already exists." another status in this company already has that name; pick a different name or edit the existing one.
- If you see "Status color must be a hex value like #22c55e." the colour text box holds something other than a `#RGB` or `#RRGGBB` value; use the colour picker.
- If you see "This company already has statuses. Copy is only available during first-time setup." the copy shortcut is closed; add further statuses one by one with **New status**.
- If you see "You can only copy from a company in the same subscription." the source company belongs to another subscription and cannot be used.
- If you see "Your role's data scope does not allow amending this record." the status was created by someone outside your data scope; ask your administrator.
- If you see "Select a workspace first." pick a company in the header before using this screen.
- Use **Warning** as an advisory stage before converting a member to a truly barred status - staff see the alert at the counter but the transaction still goes through.
- Give statuses distinct colours: the colour is the quickest way to read a member's standing on the Memberships list.

## Related options

- Membership Management → Membership Type - each type names the default status given to a new member.
- Membership Management → Memberships and Members - where a status is assigned to a membership or person.
- Membership Management → Membership Type → Standing charges - recurring charges are keyed to the member's status.
- Membership Management → Business Insights → Membership Analysis - the status chart uses the colours set here.
