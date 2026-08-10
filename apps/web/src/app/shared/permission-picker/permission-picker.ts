import { Component, computed, input, model, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RoleMenuPermission } from '../../models/auth.models';

// The action flags of one selected (View-granted) menu. A menu present in the
// selection map = View; the flags refine Create/Edit/Delete. New grants start
// with full access and the role builder unticks what the role shouldn't do.
export interface GrantFlags {
  create: boolean;
  edit: boolean;
  delete: boolean;
}

export const FULL_ACCESS: GrantFlags = { create: true, edit: true, delete: true };

// The minimal catalogue-row shape the picker needs - satisfied by both the
// tenant catalogue (MenuItem, GET /auth/account/menus) and the platform one
// (AdminMenu, GET /admin/menus).
export interface PickerMenu {
  id?: string;
  name: string;
  description?: string | null;
  icon?: string;
  parentId?: string | null;
  sequence?: number;
  Module?: { name: string } | null;
}

// A node in one module's permission tree (adjacency list over Menu.parentId).
// A node with children is a pure grouping section — it is NOT selectable: the
// backend re-adds ancestor sections of any granted menu at login, so a role
// only ever needs (and only ever stores) its leaf menus.
interface PermTreeNode {
  menu: PickerMenu;
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

// The SHARED role-builder permission picker (menu search, one collapsible card
// per module with tri-state select-all, the real menu tree with grouping menus
// as non-selectable headings, per-menu Create/Edit/Delete toggles, and the
// outcome summary). Used by BOTH role editors - tenant Role Management
// (catalogue = the account's entitled menus) and platform System Roles
// (catalogue = the platform-audience menus) - so the two never drift.
//
// Selection state is a two-way `grants` model (menuId -> GrantFlags; a key
// existing = View granted). The parent seeds it from a loaded role (group
// grants are tolerated - they are invisible here and stripped from the
// output) and reads the final payload via `permissions()`.
@Component({
  selector: 'app-permission-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './permission-picker.html',
  styleUrl: './permission-picker.css',
})
export class PermissionPickerComponent {
  // The catalogue; everything the picker shows derives from it.
  readonly menus = input<PickerMenu[]>([]);
  readonly loading = input(false);
  // Shown when the catalogue is empty (not loading) - workspace-specific wording.
  readonly emptyMessage = input('No menus available yet.');

  // menuId -> action flags. A key existing = the role may VIEW that menu.
  readonly grants = model<ReadonlyMap<string, GrantFlags>>(new Map<string, GrantFlags>());

  // Live filter over the permission catalogue (menu name / description /
  // module name). While searching, every matching card renders expanded.
  readonly permSearch = signal('');

  // Module cards the user has expanded (all start collapsed on dialog open -
  // the picker lives inside the dialog's @if, so state resets with it).
  readonly expandedModules = signal<ReadonlySet<string>>(new Set<string>());

  // The catalogue as one permission tree per module (unfiltered).
  readonly permModules = computed<PermModule[]>(() => this.buildModuleTrees(this.menus()));

  // Grouping (non-leaf) menu ids — never granted; stripped from the output so
  // legacy parent grants age out on the next save.
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
    const selected = this.grants();
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

  // The grant payload for Save: the selected LEAF menus with their flags.
  // Grouping menus are never granted (safety net for a role loaded before the
  // catalogue arrived, when group ids couldn't be stripped yet).
  permissions(): RoleMenuPermission[] {
    const groups = this.groupIds();
    const out: RoleMenuPermission[] = [];
    for (const [menuId, flags] of this.grants()) {
      if (groups.has(menuId)) continue;
      out.push({ menuId, canCreate: flags.create, canEdit: flags.edit, canDelete: flags.delete });
    }
    return out;
  }

  clearPermSearch() {
    this.permSearch.set('');
  }

  // ---------- Permission tree building (module → nested groups → leaves) ----------

  // Group the flat catalogue by module (first-seen order) and build each
  // module's adjacency tree, siblings ordered by sequence then name — the same
  // shape the sidebar renders. A menu whose parent isn't in the set roots itself.
  private buildModuleTrees(menus: PickerMenu[]): PermModule[] {
    const byModule = new Map<string, PickerMenu[]>();
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
    const selected = this.grants();
    let hit = 0;
    for (const id of leafIds) if (selected.has(id)) hit++;
    return hit === leafIds.length ? 'all' : hit > 0 ? 'some' : 'none';
  }

  selectedIn(leafIds: string[]): number {
    const selected = this.grants();
    return leafIds.filter((id) => selected.has(id)).length;
  }

  isSelected(menuId: string): boolean {
    return this.grants().has(menuId);
  }

  actionAllowed(menuId: string, action: keyof GrantFlags): boolean {
    const flags = this.grants().get(menuId);
    return !!flags && flags[action];
  }

  // Select-all semantics: not-yet-complete (none or some) selects the rest
  // (new grants start as full access, already-selected rows keep their flags);
  // fully selected clears.
  toggleAll(leafIds: string[]) {
    const next = new Map(this.grants());
    const complete = leafIds.length > 0 && leafIds.every((id) => next.has(id));
    for (const id of leafIds) {
      if (complete) next.delete(id);
      else if (!next.has(id)) next.set(id, { ...FULL_ACCESS });
    }
    this.grants.set(next);
  }

  // Flip one action flag on a selected menu (the toggle only renders while the
  // menu's View checkbox is ticked, so the grant always exists here).
  toggleAction(menuId: string, action: keyof GrantFlags) {
    const current = this.grants().get(menuId);
    if (!current) return;
    const next = new Map(this.grants());
    next.set(menuId, { ...current, [action]: !current[action] });
    this.grants.set(next);
  }

  // Toggle a menu's View grant. Selecting starts as full access (untick
  // actions to restrict); deselecting drops the whole grant.
  toggleMenu(menuId: string) {
    const next = new Map(this.grants());
    if (next.has(menuId)) next.delete(menuId);
    else next.set(menuId, { ...FULL_ACCESS });
    this.grants.set(next);
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
}
