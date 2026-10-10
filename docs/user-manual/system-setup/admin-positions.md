# Positions

> **Where:** System Setup → Positions
>
> **Who can use it:** users whose role includes the System Setup module (your organization's administrators, including the Tenant Admin).
> The New, Load defaults, Edit and Enable/Disable controls only appear when the role also has the matching Create and Edit permissions on this screen.

## What this option is for

The Positions screen maintains your organization's seniority ladder - the job levels your staff hold, such as Staff, Supervisor and Manager.
Each position carries a rank: the higher the rank, the more senior the position, and positions with the same rank are peers.
The list belongs to your whole subscription and is assigned to your staff per company on the User Management screen.
Rank matters for access control: a role whose data scope is "Department" lets a person amend records created by colleagues in the same department whose position rank is strictly lower - a Manager over a Supervisor, a Supervisor over Staff - while equal ranks cannot amend each other's records.
Approval workflows can also route a step to a department and position, so this list is what Workflow Setup offers there.

## The screen at a glance

[Screenshot: Positions list]

- A count line at the top shows how many positions exist and how many are active, next to a **Load defaults** button.
- Each position is a card showing its code as the title, with the description and **Rank N** underneath.
- A status chip at the top right of each card shows **Active** or **Disabled**.
- Active positions are listed first, most senior (highest rank) at the top, followed by the disabled ones.
- A search box filters the list as you type; it matches the code and the description.
- Each card has an **Edit** button and a **⋮** menu (More actions) holding **Enable** or **Disable**.
- The **New position** button sits at the bottom right of the screen.
- When the list is empty, the screen offers **Load defaults** directly in the empty state.

## Common tasks

### Load the standard ladder (Load defaults)

[Screenshot: Load default positions dialog]

Use this to start with the standard three-level ladder instead of typing it in.

1. Click **Load defaults**.
2. The dialog lists the standard positions with their code, description and rank: Staff (rank 10), Supervisor (rank 20) and Manager (rank 30).
   Positions you already have are marked **already added** and cannot be selected; they will not be changed.
   The new ones are pre-ticked.
3. Untick anything you do not want.
4. Click **Add N positions** - the button states exactly how many will be created.

The system reports how many positions were created and how many were skipped.
Running Load defaults again is safe: existing codes are never overwritten.

### Add a new position

[Screenshot: New position dialog]

1. Click **New position**.
2. Enter the **Position code**, for example `MGR`.
3. Optionally enter the **Description** that staff will recognise, for example `Manager`.
4. Enter the **Rank** - a whole number where higher means more senior, for example `30`.
5. Click **Save**.

The position appears in the list as Active and can be assigned to people on User Management straight away.

### Edit a position

1. Find the position (use the search box if the list is long) and click **Edit**.
2. Change the code, description or rank.
   Changing a rank immediately changes who can amend whose records under the "Department" data scope.
3. Click **Save**.

If you leave the dialog with unsaved changes (Cancel, ✕, Esc, or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable / enable a position

- Open the card's **⋮** menu and click **Disable** to retire a position you no longer use.
  A disabled position disappears from the Position pickers on User Management and Workflow Setup, but people already holding it keep that placement.
- Open the **⋮** menu of a disabled position and click **Enable** to bring it back.

There is no delete: disabling is how you remove a position from use while keeping history intact.

## Field reference

### New position / Edit dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Position code** | Yes | A short code that identifies the position, e.g. `MGR`. | Up to 30 characters; must be unique within your organization. |
| **Description** | No | The position name as staff know it, e.g. `Manager`. It is what the pickers on other screens display. | Up to 200 characters. |
| **Rank** | Yes | The seniority number - higher is more senior, e.g. `10` for Staff, `20` for Supervisor, `30` for Manager. Leave gaps so you can slot new levels in between later. | A whole number; decimals are dropped. Equal ranks are peers. |

### Load default positions dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Position tick boxes** | No | Tick each standard position you want created; already-added ones are greyed out. | At least one must be ticked for the **Add** button to be enabled. |

## Tips & troubleshooting

- If you see "Position code is required." fill in the code.
- If you see "Rank must be a whole number (higher = more senior)." enter a whole number such as `20`.
- If you see "Position 'X' already exists." another position already uses that code; search the list (it may be disabled) and enable or edit it instead of creating a second one.
- If you see "Your account could not be resolved." your sign-in is not attached to a subscription; sign out and in again, or ask your administrator.
- A person with no position counts as the most junior under the "Department" data scope, so give every staff member a position if you rely on that scope.
- Always fill in the description: User Management and Workflow Setup show the description in their pickers and only fall back to the code when it is blank.

## Related options

- **Departments** (System Setup → Departments) - the department list that works together with positions for the "Department" data scope.
- **User Management** (System Setup → User Management) - where each person is given a position per company.
- **Role Management** (System Setup → Role Management) - where a role's data scope (own / department / all) is chosen.
- **Workflow Setup** (System Setup → Workflow Setup) - approval steps can be routed to a department and position.
