# Departments

> **Where:** System Setup → Departments
>
> **Who can use it:** users whose role includes the System Setup module (your organization's administrators, including the Tenant Admin).
> The New, Edit and Enable/Disable controls only appear when the role also has the matching Create and Edit permissions on this screen.

## What this option is for

The Departments screen maintains your organization's list of staff departments, for example Finance, Membership, Golf Operations or Front Desk.
The list belongs to your whole subscription: every company you run shares the same departments.
Departments are assigned to your staff per company on the User Management screen, and they matter for access control: a role whose data scope is "Department" lets a senior person amend records created by juniors in the same department.
Approval workflows can also route a step to "a department", so the department list is what Workflow Setup offers there.
Staff come here when a new department is created, when a description needs correcting, or when a department should no longer be offered.

## The screen at a glance

[Screenshot: Departments list]

- A count line at the top shows how many departments exist and how many are active.
- Each department is a card showing its code as the title and its description underneath.
- A status chip at the top right of each card shows **Active** or **Disabled**.
- Active departments are listed first, in alphabetical order of code, followed by the disabled ones.
- A search box filters the list as you type; it matches the code and the description.
- Each card has an **Edit** button and a **⋮** menu (More actions) holding **Enable** or **Disable**.
- The **New department** button sits at the bottom right of the screen.

## Common tasks

### Add a new department

[Screenshot: New department dialog]

1. Click **New department**.
2. Enter the **Department code**, for example `FIN`.
3. Optionally enter the **Description** that staff will recognise, for example `Finance`.
4. Click **Save**.

The department appears in the list as Active and can be assigned to people on User Management straight away.

### Edit a department

1. Find the department (use the search box if the list is long) and click **Edit**.
2. Change the code or the description.
3. Click **Save**.

If you leave the dialog with unsaved changes (Cancel, ✕, Esc, or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable / enable a department

- Open the card's **⋮** menu and click **Disable** to retire a department you no longer use.
  A disabled department disappears from the Department pickers on User Management and Workflow Setup, but people already placed in it keep that placement.
- Open the **⋮** menu of a disabled department and click **Enable** to bring it back.

There is no delete: disabling is how you remove a department from use while keeping history intact.

## Field reference

### New department / Edit dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Department code** | Yes | A short code that identifies the department, e.g. `FIN`. | Up to 30 characters; must be unique within your organization. |
| **Description** | No | The department name as staff know it, e.g. `Finance`. It is what the pickers on other screens display. | Up to 200 characters. |

## Tips & troubleshooting

- If you see "Department code is required." fill in the code - it is the only mandatory field.
- If you see "Department 'X' already exists." another department already uses that code; search the list (it may be disabled) and enable or edit it instead of creating a second one.
- If you see "Your account could not be resolved." your sign-in is not attached to a subscription; sign out and in again, or ask your administrator.
- Always fill in the description: User Management and Workflow Setup show the description in their pickers and only fall back to the code when it is blank.
- Set up departments and positions before placing staff, so each person's department and seniority are complete from day one.

## Related options

- **Positions** (System Setup → Positions) - the seniority ladder that works together with departments for the "Department" data scope.
- **User Management** (System Setup → User Management) - where each person is placed in a department and position per company.
- **Role Management** (System Setup → Role Management) - where a role's data scope (own / department / all) is chosen.
- **Workflow Setup** (System Setup → Workflow Setup) - approval steps can be routed to a department.
