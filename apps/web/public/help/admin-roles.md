# Role Management

> **Where:** System Setup → Role Management
>
> **Who can use it:** users whose role includes the System Setup module (your organization's administrators, including the Tenant Admin).
> The New role, Edit and Delete controls only appear when the role also has the matching Create, Edit and Delete permissions on this screen.

## What this option is for

A role is a named set of permissions - which screens its holders can open, what they may do on each (create, edit, delete), and whose records they may amend.
Roles are defined once for your whole organization and then assigned to people per company on the User Management screen, so a "Front Desk Cashier" role can be reused in every club.
This screen is where you create those roles, pick their menu permissions from the modules your organization is entitled to, and set their data scope.
The **Tenant Admin** role is managed by the system: it always has full access and cannot be edited or deleted.
Staff come here when a new job function needs access, when a role should gain or lose a screen, or when a role is no longer used.

## The screen at a glance

[Screenshot: Role Management list]

- A search box filters the list as you type; it matches the role name and description.
- Each role is a card showing its name, its description, how many menus it grants, and its data scope when it is not "all records" (**own records only** or **department scope**).
- Each card has an **Edit** button and a **⋮** menu (More actions) holding **Delete**.
- The Tenant Admin card shows **System role** instead of actions.
- The **New role** button sits at the bottom right of the screen.

## Common tasks

### Create a role

[Screenshot: New role dialog with the permission picker]

1. Click **New role**.
2. Enter the **Role Name**, for example `Front Desk Cashier`, and optionally a **Description**.
3. Choose the **Data scope**: Own records, Department (senior over junior), or All records.
4. Under **Assign Permissions**, tick the menus the role may open.
   - One collapsible card per module shows "x of y selected"; the tick box in its header selects or clears the whole module.
   - Grouping sections inside a module have their own tick box to select everything beneath them.
   - Each menu shows a short description so you know what the screen does.
   - Use **Search menus** to find a screen by name or description.
5. For each ticked menu, untick **Create**, **Edit** or **Delete** to withhold those actions.
   A newly ticked menu starts with full access; ticking a menu always grants viewing.
6. Check the summary line ("N menus across M modules selected") and click **Save**.

The role is created and can be assigned on User Management immediately.

### Edit a role

1. Find the role (use the search box if the list is long) and click **Edit**.
2. The dialog loads the role's name, description, data scope and current permissions.
3. Change what you need and click **Save**.

Changes apply to everyone holding the role from their next sign-in.
If you leave the dialog with unsaved changes (Cancel, ✕, Esc, or the browser back button), the system asks whether to discard your changes or keep editing.

### Delete a role

1. Open the card's **⋮** menu and click **Delete**.
2. Read the confirmation - it reminds you that the role and its permissions are removed and that users must be reassigned first - and click **Delete**.

A role still held by anyone cannot be deleted; change those people's role on User Management first.

## Field reference

### New role / Edit role dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Role Name** | Yes | A name staff will recognise, e.g. `Golf Pro` or `Front Desk Cashier`. | Up to 100 characters; must be unique within your organization. |
| **Description** | No | What the role is for, e.g. `Handles front-desk check-in and payments`. | Up to 255 characters. |
| **Data scope** | Yes | Whose records the role may amend on the screens it can edit (viewing is not affected): **Own records** = only records the person created; **Department (senior over junior)** = own records plus records created in the person's department by someone of a lower position rank; **All records** = everything in the company. | Defaults to All records. Department scope relies on each person's department and position set on User Management. |
| **Assign Permissions** | Yes (at least one menu) | Tick each menu the role may open; the module and section tick boxes select many at once. | At least one menu must be ticked to save. Grouping sections themselves are not permissions - they open automatically when a menu inside them is granted. |
| **Create / Edit / Delete** (per ticked menu) | No | Untick an action the role should not have on that screen; the screen then hides the matching buttons for the role's holders. | All three are on for a newly ticked menu. |

## Tips & troubleshooting

- If you see "Please select at least one menu permission." or "Select at least one menu permission." tick at least one menu before saving.
- If you see "A role with that name already exists." choose a different name or edit the existing role.
- If you see "Role name is required." fill in the name.
- If you see "The Tenant Admin role is managed by the system and can't be edited." (or "...can't be deleted.") you tried to change the system role; create a separate role instead.
- If you see "N user(s) still have this role. Change their role on the User Management screen first, then delete it." reassign those people and try again.
- If you see "One or more selected menus do not exist." the menu catalogue changed while you were editing; reload the screen and tick the menus again.
- If you see "A role must keep at least one menu permission." you cannot save a role with every menu unticked.
- Menus only appear in the picker when your organization is entitled to their module; if a screen is missing, check the company's modules on Companies.
- Only the menus you tick are stored: any sections above them are opened automatically, so there is no need to tick the headings.
- Permission changes reach a signed-in user after they sign out and in again.

## Related options

- **User Management** (System Setup → User Management) - assigns roles, departments and positions to people per company.
- **Departments** and **Positions** (System Setup) - the lists the Department data scope relies on.
- **Companies** (System Setup → Companies → Edit modules) - the modules whose menus can be granted.
