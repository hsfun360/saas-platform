# System Roles

> **Where:** SaaS Administration → Access → System Roles (shown in the sidebar as **Roles**)
>
> **Who can use it:** platform (system) administrators whose role includes the SaaS Administration module.
> **Create role** needs the Create permission, **Edit** needs the Edit permission, and **Delete** needs the Delete permission; a role without a permission simply does not see that button.

## What this option is for

System roles define what platform staff may do in the platform workspace.
A role is a named bundle of permissions over the platform's own screens (the SaaS Administration menus): which screens the role can open, and on each of them whether it may create, edit and delete.
A role also carries a data scope that limits whose records its holders may amend.
Roles are granted to platform users on the Assign Role screen, so this is where you design the access levels - for example a read-only Support role, a Reference Data Maintainer, or a full Operations Manager.
The seeded **System Admin** role is managed by the system: it has every platform menu and cannot be edited or deleted.

## The screen at a glance

[Screenshot: System Roles list]

- A search box filters the list as you type; it matches the role name and description.
- One card per role showing its name, its description, and a meta line with the number of menus granted and, where it is not "All records", the data scope.
- The System Admin role shows a **System-managed** badge and "Menus: All (implicit)"; it has no Edit or Delete actions.
- Every other card has an **Edit** button and a ⋮ menu holding **Delete**.
- The **Create role** button floats at the bottom right.

## Common tasks

### Create a role

[Screenshot: Create role dialog with the permission picker]

1. Click **Create role**.
2. Type the **Role Name**, e.g. `Support`, and optionally a **Description**.
3. Under **Data scope**, choose whose records the role may amend: **Own records**, **Department (senior over junior)** or **All records**.
4. Under **Menu Permissions**, tick the screens the role may open.
   Each module is a collapsible card with a select-all box in its header and an "x of y selected" count; grouping sections have their own select-all; the search box filters the whole catalogue.
   Ticking a screen grants viewing plus full Create, Edit and Delete; untick any of the three action boxes that appear next to it to restrict the role.
5. Check the summary line at the bottom of the picker, e.g. "6 menus across 1 module selected."
6. Click **Save**.

A green message confirms, e.g. "Role "Support" created with 6 menu permission(s)."

### Edit a role

1. Find the role and click **Edit**.
   The dialog opens with "Loading role…" until the exact grants are fetched.
2. Change the name, description, data scope or permissions.
3. Click **Save**.

Users holding the role see the change after their next login, because the sidebar is cached at login.
If you try to leave the dialog with unsaved changes (Cancel, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.

### Delete a role

1. Open the ⋮ menu on the card and click **Delete**.
2. A confirmation states that the role and its menu permissions will be removed and cannot be undone; click **Delete**.

A role that users still hold cannot be deleted: reassign those users on Assign Role first.

### Find a role

- Type part of a name or description in the search box.
- Click the ✕ in the search box, or **Clear search** on the "no matches" message, to see every role again.

## Field reference

### Role card (read-only)

| Field | What it shows |
| --- | --- |
| **Title line** | The role name. |
| **Description** | The optional description. |
| **Menus** | How many screens the role may open ("All (implicit)" for System Admin). |
| **Scope** | Shown only for Own records or Department scopes. |
| **System-managed** | Badge on the seeded System Admin role. |

### Create / Edit role dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Role Name** | Yes | A name that describes the access level, e.g. `Support`. | Up to 150 characters; must be unique among system roles. |
| **Description** | No | What the role is for, shown on the card. | Up to 255 characters. |
| **Data scope** | Yes | **Own records** - only records the user created; **Department (senior over junior)** - own records plus records created in the user's department by someone of a lower position rank; **All records** - every record. | Defaults to All records. |
| **Menu Permissions** | Yes | The screens the role may open, each with its Create, Edit and Delete boxes. | At least one screen must be selected; grouping sections cannot be granted on their own, only the screens inside them. |

## Tips & troubleshooting

- If you see "Role name is required." type a name before saving.
- If you see "Please select at least one menu permission." tick at least one screen in the picker.
- If you see "Role already exists for this workspace." or "Another system role already uses this name." pick a different name.
- If you see "The System Admin role is managed by the system and can't be edited." or "... can't be deleted." create a separate role for the access level you need.
- If you see "3 user(s) still have this role. Change their role under Assign Role first, then delete it." reassign those users before deleting.
- If you see "One or more selected menus do not exist in the platform catalogue." a menu was removed while you were editing; reopen the dialog.
- If you see "Data scope must be one of: own, department, all." choose one of the three options.
- If you see "Failed to load this role for editing.", "Failed to create role.", "Failed to update role." or "Failed to delete role." something went wrong on the server; try again, and contact support if it persists.
- Build roles from the least access upwards: a role with view-only on a screen hides that screen's New, Edit and Delete buttons for its holders automatically.
- The Department scope depends on departments and positions being assigned to users; a holder without a placement is treated as Own records only.

## Related options

- **Assign Role** (SaaS Administration → Access → Assign Role) - grants a role defined here to a platform user.
- **Platform Users** (SaaS Administration → Access → Platform Users) - the accounts the roles are granted to.
- **Platform Modules & Menus** (SaaS Administration → Configuration → Platform Modules & Menus) - defines the screens that appear in the permission picker.
