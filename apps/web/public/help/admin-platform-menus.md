# Platform Modules & Menus

> **Where:** SaaS Administration → Configuration → Platform Modules & Menus
>
> **Who can use it:** platform (system) administrators whose role includes the SaaS Administration module.
> **Add module**, **Add menu** and **Add sub-menu** need the Create permission, **Edit** needs the Edit permission, and **Delete** needs the Delete permission; a role without a permission simply does not see that button.

## What this option is for

This screen maintains the catalogue of the platform's own staff screens - the modules and menus that platform administrators work in, which are never offered to subscribers.
The SaaS Administration module itself, with its Access, Reference data and Configuration sections, lives here.
A **Module** here is a staff-only area; each **Menu** inside it is a navigation entry that can be granted to a platform role on the System Roles screen.
Staff come here to publish a new platform screen, to rename or reorder platform menus, or to add translations, exactly as Tenant Modules & Menus does for the subscriber catalogue.

## The screen at a glance

[Screenshot: Platform Modules & Menus with the SaaS Administration module selected]

- Two panes side by side on a desktop: **Modules** on the left (the master list) and **Menus** on the right (the detail for the selected module).
  On a phone the panes show one at a time, with a **Modules** back button on the detail.
- The Modules pane has a search box (matching module name and description) and one card per platform module showing its icon, name and description.
  Each card has an **Edit** button and, for a module you added yourself, a ⋮ menu holding **Delete**; the seeded SaaS Administration module shows the label "System module" instead because it can never be deleted.
  Clicking a module card opens its menus; the open module is highlighted.
- The Menus pane shows "Menus in <module>", a hint about dragging, a search box (matching menu name and route), **Expand all** / **Collapse all** links, and the menu tree.
  Each menu row has a drag grip, a chevron when it has sub-menus (with a count badge), its icon, its name, its route, an **Edit** button and a ⋮ menu holding **Add sub-menu** and **Delete**.
  When a module is first opened, every group starts collapsed.
- While you are searching menus the tree flattens into a plain list and dragging is paused.
- Two floating buttons at the bottom right: **Add module**, and **Add menu** once a module is selected.
- The selected module is part of the page address, so you can bookmark it and use the browser back button.

## Common tasks

### Add a platform module

[Screenshot: Add module dialog on the platform side]

1. Click **Add module**.
2. Type the **Code**, a short fixed identifier in capitals such as `PLATFORM_OPS`.
   It cannot be changed afterwards.
3. Type the **Name**, and optionally a **Material icon** name and a **Description**.
4. A note in the dialog reminds you that this creates a platform module: staff-only, never offered to subscribers, with menus grantable to platform roles.
5. Under **Translations**, optionally type the name in each active language.
6. Click **Save**.

The new module opens in the Menus pane so you can add its menus.
Platform staff see it in their apps switcher only once a platform role has been granted at least one of its menus.

### Edit a module

1. Click **Edit** on the module card.
2. Change the name, icon, description or translations; the **Code** is shown greyed out and cannot be changed.
3. Click **Save**.

### Delete a module

1. Open the ⋮ menu on the module card and click **Delete**.
2. A confirmation states that the module and all its menus will be removed; click **Delete**.

The seeded SaaS Administration module is marked "System module" and cannot be deleted.

### Add a menu

[Screenshot: Add menu dialog]

1. Select the module, then click **Add menu** (or open the ⋮ menu on an existing menu and click **Add sub-menu** to nest the new one under it).
2. Type the **Name** shown in the sidebar, e.g. `Audit Log`.
3. Type the **Route**, the screen's address inside the app, e.g. `/admin/audit-log`.
   For a grouping section such as Access or Reference data, the route is still required but is never opened.
4. Optionally type a **Description** (shown under the menu name when permissions are assigned on System Roles), a **Material icon** name, and pick a **Parent** to nest the menu under a section.
5. Under **Translations**, optionally type the name and description in each active language.
6. Click **Save**.

### Edit, reorder or delete a menu

- **Edit**: click the pencil button on the row, change what you need (including the **Parent** to move it to another section), and click **Save**.
- **Reorder**: drag a row by its grip within its own level; the new order saves immediately.
  To move a menu to another section, edit it and change its Parent.
- **Delete**: open the ⋮ menu on the row, click **Delete**, and confirm; any platform role permissions to the menu are removed with it.
- Use **Expand all** or **Collapse all** to open or fold every section.

### Leave a dialog

- If you try to leave the module or menu dialog with unsaved changes (Cancel, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.

## Field reference

### Module card (read-only)

| Field | What it shows |
| --- | --- |
| **Icon and name** | The module's icon and display name, as shown in the apps switcher. |
| **Description** | The optional short description. |
| **System module** | Shown on the seeded SaaS Administration module in place of the Delete action, because the platform depends on it. |

### Add / Edit module dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Code** | Yes (when adding) | The module's fixed identity, e.g. `PLATFORM_ADMIN`. | Letters, digits and underscores, starting with a letter, up to 30 characters; stored in capitals; must be unique; cannot be changed after creation. |
| **Name** | Yes | The display name, e.g. `SaaS Administration`. | Up to 100 characters; must be unique among platform modules. |
| **Material icon** | No | The icon shown beside the module, e.g. `admin_panel_settings`. | Any Material Icons name; a generic icon is used when blank. |
| **Description** | No | A short description of the area. | - |
| **Translations (one box per language)** | No | The module name in that language. | Up to 100 characters each; blank falls back to the Name. |

### Add / Edit menu dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Name** | Yes | The label platform staff see in the sidebar, e.g. `Audit Log`. | Up to 100 characters. |
| **Route** | Yes | The screen's address inside the app, e.g. `/admin/audit-log`. Permissions and the header title are looked up by it, so it must match exactly. | Up to 200 characters. |
| **Description** | No | What the screen is for; shown under the menu name on the System Roles permission picker. | Up to 255 characters. |
| **Material icon** | No | The icon shown beside the menu, e.g. `history`. | Any Material Icons name; a folder icon is used when blank. |
| **Parent** | No | The section to nest this menu under, e.g. Access. | Pick from this module's menus; "Top level (no parent)" leaves it at the top; a menu cannot be placed under itself or its own sub-menus. |
| **Translations (name and description per language)** | No | The menu name and description in that language. | Name up to 100 characters, description up to 255 characters; blank falls back to the values above. |

## Tips & troubleshooting

- If you see "Module code and name are required." or "A code is required: letters/digits/underscores, starting with a letter." fill in the Code (capitals, no spaces) and the Name.
- If you see "A module with code X already exists." or "A platform module with that name already exists." pick a different code or name.
- If you see "A module's code is its frozen identity and cannot be changed." or "A module's audience is fixed at creation and cannot be changed." only the name, icon, description and translations of an existing module can change.
- If you see "This is a system module and cannot be deleted." the module is the seeded SaaS Administration module; restrict access by removing its menus from roles instead.
- If you see "Menu name and route are required." fill in both before saving.
- If you see "The selected parent menu does not belong to this module.", "A menu cannot be nested under itself or one of its own descendants." or "A menu cannot move between tenant and platform modules." pick a different Parent.
- If you see "Failed to save the new order." the drag could not be saved and the tree reloads to the saved order; try again.
- Be careful editing the SaaS Administration menus: removing or re-routing the System Roles or Platform Modules & Menus entries can lock platform staff out of this very screen.
  The seeded menus are restored at the next platform start if they go missing.
- Menu renames show for a user after their next login, because the sidebar is cached at login.

## Related options

- **System Roles** (SaaS Administration → Access → System Roles) - grants the menus defined here to platform roles.
- **Tenant Modules & Menus** (SaaS Administration → Configuration → Tenant Modules & Menus) - the same maintenance for the subscriber catalogue.
- **Languages** (SaaS Administration → Reference data → Languages) - defines the languages offered in the Translations sections.
