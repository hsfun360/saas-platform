import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../auth.service';
import { MenuItem, Role } from '../models/auth.models';
import { DialogComponent } from '../shared/dialog/dialog';

// A node in one module's permission tree (adjacency list over Menu.parentId).
// A node with children is a pure grouping section — it is NOT selectable: the
// backend re-adds ancestor sections of any granted menu at login, so a role
// only ever needs (and only ever stores) its leaf menus.
interface PermTreeNode {
  menu: MenuItem;
  children: PermTreeNode[];
}

// One module's permission tree, as loaded (unfiltered).
interface PermModule {
  name: string;
  roots: PermTreeNode[];
}

// A flattened display row of the (possibly search-filtered) tree. `leafIds`
// is the row's selectable leaf set: the leaf itself, or every leaf underneath
// a group row — what its checkbox toggles and its tri-state derives from.
interface PermRow {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  depth: number;
  group: boolean;
  leafIds: string[];
}

// A module card as rendered: filtered rows, but counts over the FULL leaf set
// so "x of y selected" stays truthful while a search narrows the rows.
interface PermModuleView {
  name: string;
  rows: PermRow[];
  leafIds: string[];
}

// Account-level Role Management. A Role is just a named set of menu permissions
// (RBAC) — NOT tied to a company. Company enters only at entitlement (module
// subscription) and assignment (user↔role within a company). The permission
// catalogue is the subscriber account's entitled menus.
//
// The name/description dialog is a typed Reactive Form (canonical reference:
// platform-users); validators live on the controls and `roleForm.dirty` feeds
// the shared dialog's unsaved-changes guard. The menu/permission checkboxes are
// managed separately (a signal-held Set), not part of the form.
@Component({
  selector: 'app-role-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogComponent],
  templateUrl: './role-management.html',
  styleUrls: ['./role-management.css'],
})
export class RoleManagementComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  // Dialog form (name + description). nonNullable keeps controls non-null strings.
  readonly roleForm = this.fb.nonNullable.group({
    roleName: ['', [Validators.required, Validators.maxLength(100)]],
    roleDescription: ['', [Validators.maxLength(255)]],
  });

  roles = signal<Role[]>([]);
  rolesLoading = signal(false);

  // Live filter over the loaded roles (name / description).
  roleSearch = signal('');
  filteredRoles = computed(() => {
    const query = this.roleSearch().trim().toLowerCase();
    const list = this.roles();
    if (!query) return list;
    return list.filter(
      (r) =>
        (r.name || '').toLowerCase().includes(query) ||
        (r.description || '').toLowerCase().includes(query),
    );
  });

  // The account's entitled menu catalogue, loaded once; everything the
  // permission picker shows derives from it.
  accountMenus = signal<MenuItem[]>([]);
  menusLoading = signal(false);
  selectedMenuIds = signal<ReadonlySet<string>>(new Set<string>());

  // Live filter over the permission catalogue (menu name / description /
  // module name). While searching, every matching card renders expanded.
  permSearch = signal('');

  // Module cards the user has expanded (all start collapsed on dialog open).
  expandedModules = signal<ReadonlySet<string>>(new Set<string>());

  // The catalogue as one permission tree per module (unfiltered).
  readonly permModules = computed<PermModule[]>(() => this.buildModuleTrees(this.accountMenus()));

  // Grouping (non-leaf) menu ids — never granted; stripped from loaded roles
  // and from the save payload so legacy parent grants age out on next save.
  readonly groupIds = computed<ReadonlySet<string>>(() => {
    const ids = new Set<string>();
    const walk = (node: PermTreeNode) => {
      if (!node.children.length) return;
      if (node.menu.id) ids.add(node.menu.id);
      node.children.forEach(walk);
    };
    for (const mod of this.permModules()) mod.roots.forEach(walk);
    return ids;
  });

  // The module cards as rendered: search-filtered rows, full-set counts.
  readonly visiblePermModules = computed<PermModuleView[]>(() => {
    const query = this.permSearch().trim().toLowerCase();
    const view: PermModuleView[] = [];
    for (const mod of this.permModules()) {
      const roots = !query || mod.name.toLowerCase().includes(query)
        ? mod.roots
        : this.filterNodes(mod.roots, query);
      if (!roots.length) continue;
      view.push({
        name: mod.name,
        rows: this.flattenNodes(roots),
        leafIds: mod.roots.flatMap((r) => this.leafIdsOf(r)),
      });
    }
    return view;
  });

  // "N menus across M modules" — the outcome preview shown next to Save.
  readonly selectionSummary = computed(() => {
    const selected = this.selectedMenuIds();
    let menus = 0;
    let modules = 0;
    for (const mod of this.permModules()) {
      const count = mod.roots.flatMap((r) => this.leafIdsOf(r)).filter((id) => selected.has(id)).length;
      if (count > 0) {
        modules++;
        menus += count;
      }
    }
    return { menus, modules };
  });

  // Edit mode: null = creating; otherwise the id of the role being edited.
  editingRoleId = signal<string | null>(null);
  editLoading = signal(false);
  deletingRoleId = signal<string | null>(null);
  roleDialogOpen = signal(false);

  isLoading = signal(false);
  successMessage = signal('');
  errorMessage = signal('');

  // The system-managed role can't be edited or deleted (mirrors the backend
  // guard), so we hide its action buttons.
  readonly protectedRoleName = 'Tenant Admin';

  ngOnInit() {
    this.loadRoles();
    this.loadMenus();
  }

  loadRoles() {
    this.rolesLoading.set(true);
    this.authService.getAccountRoles().subscribe({
      next: (r) => {
        this.roles.set(r);
        this.rolesLoading.set(false);
      },
      error: () => this.rolesLoading.set(false),
    });
  }

  // The account-wide entitled menu catalogue for the role builder.
  loadMenus() {
    this.menusLoading.set(true);
    this.authService.getAccountMenus().subscribe({
      next: (menus) => {
        this.accountMenus.set(menus);
        this.menusLoading.set(false);
      },
      error: () => this.menusLoading.set(false),
    });
  }

  clearSearch() {
    this.roleSearch.set('');
  }

  clearPermSearch() {
    this.permSearch.set('');
  }

  // ---------- Permission tree building (module → nested groups → leaves) ----------

  // Group the flat catalogue by module (first-seen order) and build each
  // module's adjacency tree, siblings ordered by sequence then name — the same
  // shape the sidebar renders. A menu whose parent isn't in the set roots itself.
  private buildModuleTrees(menus: MenuItem[]): PermModule[] {
    const byModule = new Map<string, MenuItem[]>();
    for (const menu of menus) {
      const modName = menu.Module?.name || 'Uncategorized';
      if (!byModule.has(modName)) byModule.set(modName, []);
      byModule.get(modName)!.push(menu);
    }

    const bySeq = (a: PermTreeNode, b: PermTreeNode) =>
      (a.menu.sequence || 0) - (b.menu.sequence || 0) || a.menu.name.localeCompare(b.menu.name);

    const out: PermModule[] = [];
    for (const [name, list] of byModule) {
      const nodes = new Map<string, PermTreeNode>();
      for (const m of list) if (m.id) nodes.set(m.id, { menu: m, children: [] });
      const roots: PermTreeNode[] = [];
      for (const m of list) {
        if (!m.id) continue;
        const node = nodes.get(m.id)!;
        const parent = m.parentId ? nodes.get(m.parentId) : undefined;
        if (parent && parent !== node) parent.children.push(node);
        else roots.push(node);
      }
      const sortRec = (ns: PermTreeNode[]) => {
        ns.sort(bySeq);
        ns.forEach((n) => sortRec(n.children));
      };
      sortRec(roots);
      out.push({ name, roots });
    }
    return out;
  }

  // Keep nodes whose name/description matches (whole subtree stays), or that
  // still have matching descendants (pruned to them).
  private filterNodes(nodes: PermTreeNode[], query: string): PermTreeNode[] {
    const out: PermTreeNode[] = [];
    for (const node of nodes) {
      const text = `${node.menu.name} ${node.menu.description || ''}`.toLowerCase();
      if (text.includes(query)) {
        out.push(node);
        continue;
      }
      const children = this.filterNodes(node.children, query);
      if (children.length) out.push({ menu: node.menu, children });
    }
    return out;
  }

  // Every selectable (leaf) menu id at or under a node.
  private leafIdsOf(node: PermTreeNode): string[] {
    if (!node.children.length) return node.menu.id ? [node.menu.id] : [];
    return node.children.flatMap((c) => this.leafIdsOf(c));
  }

  // Depth-first flatten of a (filtered) tree into indented display rows.
  private flattenNodes(roots: PermTreeNode[]): PermRow[] {
    const rows: PermRow[] = [];
    const walk = (node: PermTreeNode, depth: number) => {
      if (!node.menu.id) return;
      rows.push({
        id: node.menu.id,
        name: node.menu.name,
        description: node.menu.description || null,
        icon: node.menu.icon || 'folder',
        depth,
        group: node.children.length > 0,
        leafIds: this.leafIdsOf(node),
      });
      node.children.forEach((c) => walk(c, depth + 1));
    };
    roots.forEach((r) => walk(r, 0));
    return rows;
  }

  // ---------- Selection state ----------

  // Tri-state over a leaf set: drives [checked] / [indeterminate].
  selState(leafIds: string[]): 'all' | 'some' | 'none' {
    if (!leafIds.length) return 'none';
    const selected = this.selectedMenuIds();
    let hit = 0;
    for (const id of leafIds) if (selected.has(id)) hit++;
    return hit === leafIds.length ? 'all' : hit > 0 ? 'some' : 'none';
  }

  selectedIn(leafIds: string[]): number {
    const selected = this.selectedMenuIds();
    return leafIds.filter((id) => selected.has(id)).length;
  }

  // Select-all semantics: not-yet-complete (none or some) selects the rest;
  // fully selected clears.
  toggleAll(leafIds: string[]) {
    const next = new Set(this.selectedMenuIds());
    const complete = leafIds.length > 0 && leafIds.every((id) => next.has(id));
    for (const id of leafIds) {
      if (complete) next.delete(id);
      else next.add(id);
    }
    this.selectedMenuIds.set(next);
  }

  isExpanded(moduleName: string): boolean {
    // A live search auto-expands every (matching) card.
    return this.permSearch().trim() !== '' || this.expandedModules().has(moduleName);
  }

  toggleModuleExpanded(moduleName: string) {
    const next = new Set(this.expandedModules());
    if (next.has(moduleName)) next.delete(moduleName);
    else next.add(moduleName);
    this.expandedModules.set(next);
  }

  // Show a control's validation message once the user has interacted with it
  // (or after a submit attempt marks everything touched).
  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  toggleMenu(menuId: string) {
    const next = new Set(this.selectedMenuIds());
    if (next.has(menuId)) next.delete(menuId);
    else next.add(menuId);
    this.selectedMenuIds.set(next);
  }

  // Fresh picker state on every dialog open: nothing selected, every module
  // card collapsed, no leftover search.
  private resetPicker() {
    this.selectedMenuIds.set(new Set<string>());
    this.expandedModules.set(new Set<string>());
    this.permSearch.set('');
  }

  openCreate() {
    this.clearMessages();
    this.editingRoleId.set(null);
    this.roleForm.reset({ roleName: '', roleDescription: '' });
    this.resetPicker();
    this.roleDialogOpen.set(true);
  }

  // Load a role into the dialog for editing (prefill name, description and the
  // checked permissions from the server).
  startEdit(role: Role) {
    this.clearMessages();
    this.editingRoleId.set(role.id);
    this.roleDialogOpen.set(true);
    this.roleForm.reset({ roleName: role.name, roleDescription: role.description || '' });
    this.resetPicker();

    this.editLoading.set(true);
    this.authService.getRoleDetail(role.id).subscribe({
      next: (detail) => {
        this.roleForm.reset({ roleName: detail.name, roleDescription: detail.description || '' });
        // Drop legacy grants to grouping menus — sections are implied by their
        // granted children (the backend re-adds ancestors at login).
        const groups = this.groupIds();
        this.selectedMenuIds.set(new Set(detail.menuIds.filter((id) => !groups.has(id))));
        this.editLoading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to load this role for editing.');
        this.cancelEdit();
        this.editLoading.set(false);
      },
    });
  }

  cancelEdit() {
    this.roleDialogOpen.set(false);
    this.editingRoleId.set(null);
    this.roleForm.reset({ roleName: '', roleDescription: '' });
    this.resetPicker();
  }

  onSubmit() {
    this.clearMessages();

    if (this.roleForm.invalid) {
      this.roleForm.markAllAsTouched(); // reveal every field's error at once
      return;
    }
    // Grouping menus are never granted (safety net for the race where a role
    // loaded before the catalogue did, so group ids weren't stripped yet).
    const groups = this.groupIds();
    const menuIdsArray = Array.from(this.selectedMenuIds()).filter((id) => !groups.has(id));
    if (menuIdsArray.length === 0) {
      this.errorMessage.set('Please select at least one menu permission.');
      return;
    }

    const { roleName, roleDescription } = this.roleForm.getRawValue();
    const editingId = this.editingRoleId();

    this.isLoading.set(true);

    if (editingId) {
      this.authService
        .updateRole(editingId, { roleName, description: roleDescription, menuIds: menuIdsArray })
        .subscribe({
          next: (res) => {
            this.successMessage.set(`Role '${res.role.name}' updated successfully!`);
            this.isLoading.set(false);
            this.cancelEdit();
            this.loadRoles();
          },
          error: (err) => {
            this.errorMessage.set(err.error?.message || 'Failed to update role. Please try again.');
            this.isLoading.set(false);
          },
        });
      return;
    }

    this.authService.createRole(roleName, roleDescription, menuIdsArray).subscribe({
      next: (res) => {
        this.successMessage.set(`Role '${res.role.name}' created successfully!`);
        this.isLoading.set(false);
        this.cancelEdit();
        this.loadRoles();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to create role. Please try again.');
        this.isLoading.set(false);
      },
    });
  }

  onDelete(role: Role) {
    this.clearMessages();

    const confirmed = confirm(
      `Delete the role "${role.name}"? This removes the role and its permissions. Users must be reassigned first.`,
    );
    if (!confirmed) return;

    this.deletingRoleId.set(role.id);
    this.authService.deleteRole(role.id).subscribe({
      next: () => {
        this.successMessage.set(`Role '${role.name}' deleted.`);
        this.deletingRoleId.set(null);
        if (this.editingRoleId() === role.id) this.cancelEdit();
        this.loadRoles();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to delete role. Please try again.');
        this.deletingRoleId.set(null);
      },
    });
  }

  private clearMessages() {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
