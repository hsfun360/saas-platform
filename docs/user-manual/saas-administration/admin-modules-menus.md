# Tenant Modules & Menus

> **Where:** SaaS Administration → Configuration → Tenant Modules & Menus
>
> **Who can use it:** platform (system) administrators whose role includes the SaaS Administration module.
> **Add module**, **Add menu** and **Add sub-menu** need the Create permission, **Edit** needs the Edit permission, and **Delete** needs the Delete permission; a role without a permission simply does not see that button.

## What this option is for

This screen maintains the catalogue of product areas that subscribers can subscribe to, and the screens inside each.
A **Module** is a product area such as Membership Management or Golf Management; it is what a subscriber's company is entitled to, and what appears in the apps switcher.
A **Menu** is one navigation entry inside a module - a screen staff can open, or a grouping section that holds other menus - and it is what a Tenant Admin grants to roles.
A screen only becomes reachable for a subscriber once its module is subscribed, its menu exists here, and a role has been granted that menu, so staff come here when a new product screen must be published, a menu label or order needs changing, or translations need adding.
The platform's own staff screens are maintained separately on Platform Modules & Menus.

## The screen at a glance

[Screenshot: Tenant Modules & Menus with a module selected]

- Two panes side by side on a desktop: **Modules** on the left (the master list) and **Menus** on the right (the detail for the selected module).
  On a phone the panes show one at a time, with a **Modules** back button on the detail.
- The Modules pane has a search box (matching module name and description) and one card per module showing its icon, name and description.
  Each card has an **Edit** button and, for a module that is not a system module, a ⋮ menu holding **Delete**; system modules show the label "System module" instead.
  Clicking a module card opens its menus; the open module is highlighted.
- The Menus pane shows "Menus in <module>", a hint about dragging, a search box (matching menu name and route), **Expand all** / **Collapse all** links, and the menu tree.
  Each menu row has a drag grip, a chevron when it has sub-menus (with a count badge), its icon, its name, its route, an **Edit** button and a ⋮ menu holding **Add sub-menu** and **Delete**.
  When a module is first opened, every group starts collapsed.
- While you are searching menus the tree flattens into a plain list and dragging is paused.
- Two floating buttons at the bottom right: **Add module**, and **Add menu** once a module is selected.
- The selected module is part of the page address, so you can bookmark it and use the browser back button.

## Common tasks

### Add a module

[Screenshot: Add module dialog]

1. Click **Add module**.
2. Type the **Code**, a short fixed identifier in capitals such as `GOLF`.
   It cannot be changed afterwards, because it is what entitlements and licensing refer to.
3. Type the **Name**, e.g. `Golf Management`, and optionally a **Material icon** name (e.g. `sports_golf`) and a **Description**.
4. Under **Translations**, optionally type the name in each active language.
5. Click **Save**.

The new module opens immediately in the Menus pane so you can add its menus.
A new module is not yet visible to anyone: subscribe a company to it (Companies) and grant its menus to a role (Role Management) before staff can see it.

### Edit a module

1. Click **Edit** on the module card.
2. Change the name, icon, description or translations; the **Code** is shown greyed out and cannot be changed.
3. Click **Save**.

### Delete a module

1. Open the ⋮ menu on the module card and click **Delete**.
2. A confirmation states that the module and all its menus will be removed; click **Delete**.

Modules marked "System module" cannot be deleted, and a module that any company still subscribes to is refused until it has been removed from those companies.

### Add a menu

[Screenshot: Add menu dialog]

1. Select the module, then click **Add menu** (or open the ⋮ menu on an existing menu and click **Add sub-menu** to nest the new one under it).
2. Type the **Name** staff will see in the sidebar, e.g. `Tee Time Setup`.
3. Type the **Route**, the screen's address inside the app, e.g. `/golf/tee-times`.
   For a grouping section that only holds other menus, the route is still required but is never opened.
4. Optionally type a **Description** (shown under the menu name when a role builder assigns permissions), a **Material icon** name, and pick a **Parent** to nest the menu under another one.
5. Under **Translations**, optionally type the name and description in each active language.
6. Click **Save**.

The new menu appears in the tree with its parent unfolded.

### Edit a menu

1. Click the **Edit** (pencil) button on the menu row, or **Edit** in the flat search results.
2. Change what you need, including the **Parent** to move the menu to another level.
   A menu cannot be nested under itself or under one of its own sub-menus, and the Parent list already leaves those out.
3. Click **Save**.

### Reorder menus

- Drag a row by its grip to a new position among its siblings; the new order is saved immediately and the hint shows "Saving…" while it does.
- Dragging works only within one level: to move a menu to another level, edit it and change its **Parent**.
- Use **Expand all** or **Collapse all** to open or fold every group, and the chevron on a row to toggle one group.

### Delete a menu

1. Open the ⋮ menu on the menu row and click **Delete**.
2. A confirmation states that any role permissions to it are also removed; click **Delete**.

### Leave a dialog

- If you try to leave the module or menu dialog with unsaved changes (Cancel, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.

## Field reference

### Module card (read-only)

| Field | What it shows |
| --- | --- |
| **Icon and name** | The module's icon and display name, as shown in the apps switcher. |
| **Description** | The optional short description. |
| **System module** | Shown instead of the Delete action for modules the platform depends on. |

### Add / Edit module dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Code** | Yes (when adding) | The module's fixed identity, e.g. `GOLF`. Entitlements and licensing refer to this code, so it is set once. | Letters, digits and underscores, starting with a letter, up to 30 characters; stored in capitals; must be unique; cannot be changed after creation. |
| **Name** | Yes | The display name, e.g. `Golf Management`. It may be renamed freely at any time. | Up to 100 characters; must be unique among tenant modules. |
| **Material icon** | No | The name of the icon shown beside the module, e.g. `sports_golf`. | Any Material Icons name; a generic icon is used when blank. |
| **Description** | No | A short description of the product area. | - |
| **Translations (one box per language)** | No | The module name in that language, shown in the sidebar and apps switcher when a user works in that language. | Up to 100 characters each; blank falls back to the Name. |

### Add / Edit menu dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Name** | Yes | The label staff see in the sidebar, e.g. `Tee Time Setup`. | Up to 100 characters. |
| **Route** | Yes | The screen's address inside the app, e.g. `/golf/tee-times`. It must match the screen exactly, because permissions and the header title are looked up by it. | Up to 200 characters. |
| **Description** | No | What the screen is for; shown under the menu name when a role builder assigns permissions. | Up to 255 characters. |
| **Material icon** | No | The icon shown beside the menu, e.g. `event`. | Any Material Icons name; a folder icon is used when blank. |
| **Parent** | No | The menu to nest this one under. A menu with children shows as a collapsible section in the sidebar. | Pick from this module's menus; "Top level (no parent)" leaves it at the top; a menu cannot be placed under itself or its own sub-menus. |
| **Translations (name and description per language)** | No | The menu name and description in that language. | Name up to 100 characters, description up to 255 characters; blank falls back to the values above. |

## Tips & troubleshooting

- If you see "Module code and name are required." or "A code is required: letters/digits/underscores, starting with a letter." fill in the Code (capitals, no spaces) and the Name.
- If you see "A module with code GOLF already exists." or "A tenant module with that name already exists." pick a different code or name.
- If you see "A module's code is its frozen identity and cannot be changed." the code was altered on an existing module; only the name and translations can change.
- If you see "This is a system module and cannot be deleted." the module is part of the platform itself.
- If you see "2 company(ies) still subscribe to this module. Remove it from those companies first." edit those companies' modules on the Companies screen before deleting.
- If you see "Menu name and route are required." fill in both before saving.
- If you see "The selected parent menu does not belong to this module." or "A menu cannot be nested under itself or one of its own descendants." pick a different Parent.
- If you see "A menu cannot move between tenant and platform modules." a menu stays in the module it was created in.
- If you see "Failed to save the new order." the drag could not be saved and the tree reloads to the saved order; try again.
- A new screen stays invisible until three things are in place: the module is subscribed by the company, the menu exists here, and a role holds a grant to the menu.
- The Translations section only lists languages that are active on the Languages screen (plus any language that already has a translation); if it says no languages are configured, load the defaults there first.
- Keep routes exact: a typo in the route means the screen opens without its permission checks and header title being found.

## Related options

- **Platform Modules & Menus** (SaaS Administration → Configuration → Platform Modules & Menus) - the same maintenance for the platform's own staff screens.
- **Subscriber Management** (SaaS Administration → Subscriber Management) - the modules a new subscriber is entitled to are picked from the modules defined here.
- **Companies** (System Setup → Companies) - a Tenant Admin edits which modules each company subscribes to.
- **Role Management** (System Setup → Role Management) - a Tenant Admin grants the menus defined here to roles.
- **Languages** (SaaS Administration → Reference data → Languages) - defines the languages offered in the Translations sections.
