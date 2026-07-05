import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  CdkDropList,
  CdkDrag,
  CdkDragHandle,
  CdkDragDrop,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { AdminService } from '../services/admin.service';
import { LanguageService } from '../services/language.service';
import { AdminMenu, AdminModule, Language } from '../models/auth.models';
import { DialogComponent } from '../shared/dialog/dialog';
import { FormsModule } from '@angular/forms';

// A node in the module's menu tree (adjacency list). `children` are the menus
// whose parentId is this menu, ordered by sequence. Held as plain objects whose
// arrays CDK mutates in place during a sibling drag.
interface MenuTreeNode {
  menu: AdminMenu;
  children: MenuTreeNode[];
}

// System/Master Admin master–detail maintenance for the platform catalogue:
// Modules (master) on the left, and the selected module's Menus (detail) on the
// right. Both support create / edit / delete.
//
// Navigation follows the web SlidingPaneLayout pattern:
//  - The selected module lives in the URL (/admin/modules-menus/:moduleId)
//    as the single source of truth — deep-linkable, with working back/forward.
//  - CSS shows both panes side-by-side on desktop, but one-at-a-time on mobile
//    (the detail pane covers the master once a module is picked).
@Component({
  selector: 'app-modules-menus',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, DialogComponent, CdkDropList, CdkDrag, CdkDragHandle],
  templateUrl: './modules-menus.html',
  styleUrls: ['./modules-menus.css'],
})
export class ModulesMenusComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly languageService = inject(LanguageService);
  private readonly fb = inject(FormBuilder);

  // Active languages drive the per-language "Translations" fields in the dialogs.
  readonly languages = signal<Language[]>([]);
  // One editable row per language for the open module / menu dialog (English first).
  moduleTranslations: { code: string; label: string; name: string }[] = [];
  menuTranslations: { code: string; label: string; name: string }[] = [];
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly basePath = ['/admin', 'modules-menus'];

  // --- Master: modules ---
  readonly modules = signal<AdminModule[]>([]);
  readonly modulesLoading = signal(false);

  // Live filter over the loaded modules (name / description).
  readonly moduleSearch = signal('');
  readonly filteredModules = computed(() => {
    const query = this.moduleSearch().trim().toLowerCase();
    const list = this.modules();
    if (!query) return list;
    return list.filter(
      (m) =>
        (m.name || '').toLowerCase().includes(query) ||
        (m.description || '').toLowerCase().includes(query),
    );
  });
  readonly selectedModuleId = signal<string | null>(null);
  readonly editingModuleId = signal<string | null>(null);
  readonly moduleDialogOpen = signal(false);
  readonly savingModule = signal(false);
  readonly deletingModuleId = signal<string | null>(null);

  readonly moduleForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    icon: [''],
    description: [''],
    landingRoute: [''],
  });

  // --- Detail: menus of the selected module ---
  readonly menus = signal<AdminMenu[]>([]);
  readonly menusLoading = signal(false);

  // The module's menus as a tree (adjacency list). Root nodes are top-level
  // menus; each node's `children` are its sub-menus ordered by sequence. CDK
  // reorders a sibling array in place; we re-set the signal to refresh the view.
  readonly tree = signal<MenuTreeNode[]>([]);
  readonly savingLayout = signal(false);

  // Parent options for the menu dialog's "Parent" picker (depth-indented labels),
  // excluding the menu being edited and its own descendants (no cycles).
  readonly parentOptions = signal<{ id: string; label: string }[]>([]);

  // Live filter over the loaded menus (name / route).
  readonly menuSearch = signal('');
  readonly filteredMenus = computed(() => {
    const query = this.menuSearch().trim().toLowerCase();
    const list = this.menus();
    if (!query) return list;
    return list.filter(
      (m) =>
        (m.name || '').toLowerCase().includes(query) ||
        (m.route || '').toLowerCase().includes(query),
    );
  });
  readonly editingMenuId = signal<string | null>(null);
  readonly menuDialogOpen = signal(false);
  readonly savingMenu = signal(false);
  readonly deletingMenuId = signal<string | null>(null);

  readonly menuForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    route: ['', [Validators.required, Validators.maxLength(200)]],
    icon: [''],
    parentId: [''], // '' = top level
  });

  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly selectedModule = computed(() =>
    this.modules().find((m) => m.id === this.selectedModuleId()) ?? null,
  );

  constructor() {
    // The URL is the single source of truth for which module is open. React to
    // the :moduleId param (direct nav, deep link, or browser back/forward).
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.applySelection(params.get('moduleId'));
    });
  }

  ngOnInit(): void {
    this.loadModules();
    this.languageService.listActive().subscribe({
      next: (list) => this.languages.set(list),
      error: () => {}, // no active languages -> editor falls back to existing names
    });
  }

  // Union of active languages + any language already present on the row's `names`
  // (so existing translations stay editable even if that language was later
  // deactivated). English first, then alphabetical by label.
  private buildTranslations(names?: Record<string, string>): { code: string; label: string; name: string }[] {
    const map = names || {};
    const labels = new Map<string, string>();
    for (const l of this.languages()) labels.set(l.languageCode, l.name);
    for (const code of Object.keys(map)) if (!labels.has(code)) labels.set(code, code.toUpperCase());
    return [...labels.entries()]
      .map(([code, label]) => ({ code, label, name: map[code] || '' }))
      .sort((a, b) => (a.code === 'en' ? -1 : b.code === 'en' ? 1 : a.label.localeCompare(b.label)));
  }

  private namesFrom(rows: { code: string; name: string }[]): Record<string, string> {
    const names: Record<string, string> = {};
    for (const r of rows) names[r.code] = r.name.trim();
    return names;
  }

  private applySelection(moduleId: string | null): void {
    this.selectedModuleId.set(moduleId);
    this.menuSearch.set(''); // don't carry a filter across modules
    this.cancelMenuEdit();
    if (moduleId) {
      this.loadMenus(moduleId);
    } else {
      this.menus.set([]);
      this.tree.set([]);
    }
  }

  // ---------- Modules (master) ----------

  loadModules(): void {
    this.modulesLoading.set(true);
    this.admin.listModules().subscribe({
      next: (list) => {
        this.modules.set(list);
        this.modulesLoading.set(false);
      },
      error: () => this.modulesLoading.set(false),
    });
  }

  // Navigate to a module's detail view — selection state then flows back in via
  // the route param subscription above.
  selectModule(moduleId: string): void {
    this.router.navigate([...this.basePath, moduleId]);
  }

  // Mobile "back" affordance: return to the master list (clears the param).
  backToModules(): void {
    this.router.navigate(this.basePath);
  }

  startCreateModule(): void {
    this.clearMessages();
    this.editingModuleId.set(null);
    this.moduleForm.reset({ name: '', icon: '', description: '', landingRoute: '' });
    this.moduleTranslations = this.buildTranslations({});
    this.moduleDialogOpen.set(true);
  }

  startEditModule(m: AdminModule): void {
    this.clearMessages();
    this.editingModuleId.set(m.id);
    this.moduleForm.setValue({
      name: m.name,
      icon: m.icon || '',
      description: m.description || '',
      landingRoute: m.landingRoute || '',
    });
    this.moduleTranslations = this.buildTranslations(m.names);
    this.moduleDialogOpen.set(true);
  }

  cancelModuleEdit(): void {
    this.moduleDialogOpen.set(false);
    this.editingModuleId.set(null);
    this.moduleForm.reset({ name: '', icon: '', description: '', landingRoute: '' });
  }

  saveModule(): void {
    this.clearMessages();
    if (this.moduleForm.invalid) {
      this.moduleForm.markAllAsTouched();
      this.errorMessage.set('Module name is required.');
      return;
    }

    const { name, icon, description, landingRoute } = this.moduleForm.getRawValue();
    const payload = {
      name: name.trim(), icon: icon.trim(), description: description.trim(), landingRoute: landingRoute.trim(),
      names: this.namesFrom(this.moduleTranslations),
    };
    const editingId = this.editingModuleId();

    this.savingModule.set(true);
    const req$ = editingId
      ? this.admin.updateModule(editingId, payload)
      : this.admin.createModule(payload);

    req$.subscribe({
      next: (res) => {
        this.successMessage.set(res.message || (editingId ? 'Module updated.' : 'Module created.'));
        this.savingModule.set(false);
        this.cancelModuleEdit();
        this.loadModules();
        // Open the newly created module's detail (also flips the mobile pane).
        if (!editingId && res.module?.id) {
          this.selectModule(res.module.id);
        }
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save module.');
        this.savingModule.set(false);
      },
    });
  }

  deleteModule(m: AdminModule): void {
    this.clearMessages();
    if (!confirm(`Delete the module "${m.name}"? This removes the module and all its menus.`)) return;

    this.deletingModuleId.set(m.id);
    this.admin.deleteModule(m.id).subscribe({
      next: (res) => {
        this.successMessage.set(res.message || 'Module deleted.');
        this.deletingModuleId.set(null);
        if (this.editingModuleId() === m.id) this.cancelModuleEdit();
        // If the open module was deleted, return to the master list (URL-driven).
        if (this.selectedModuleId() === m.id) this.backToModules();
        this.loadModules();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to delete module.');
        this.deletingModuleId.set(null);
      },
    });
  }

  // ---------- Menus (detail) ----------

  loadMenus(moduleId: string): void {
    this.menusLoading.set(true);
    this.admin.listModuleMenus(moduleId).subscribe({
      next: (menus) => {
        this.menus.set(menus);
        this.tree.set(this.buildTree(menus));
        this.menusLoading.set(false);
      },
      error: () => this.menusLoading.set(false),
    });
  }

  // Build the adjacency-list tree: group menus by parentId, ordered by sequence.
  // A parentId that points outside the loaded set is treated as a root (defensive).
  private buildTree(menus: AdminMenu[]): MenuTreeNode[] {
    const bySeq = (a: MenuTreeNode, b: MenuTreeNode) => (a.menu.sequence ?? 0) - (b.menu.sequence ?? 0);
    const nodes = new Map<string, MenuTreeNode>();
    for (const m of menus) nodes.set(m.id, { menu: m, children: [] });
    const roots: MenuTreeNode[] = [];
    for (const node of nodes.values()) {
      const pid = node.menu.parentId;
      const parent = pid ? nodes.get(pid) : null;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    for (const node of nodes.values()) node.children.sort(bySeq);
    roots.sort(bySeq);
    return roots;
  }

  private reloadLayout(): void {
    const moduleId = this.selectedModuleId();
    if (moduleId) this.loadMenus(moduleId);
  }

  // Optional parentId pre-selects the parent (used by a node's "Add sub-menu").
  startCreateMenu(parentId: string | null = null): void {
    this.clearMessages();
    this.editingMenuId.set(null);
    this.parentOptions.set(this.buildParentOptions(null));
    this.menuForm.reset({ name: '', route: '', icon: '', parentId: parentId || '' });
    this.menuTranslations = this.buildTranslations({});
    this.menuDialogOpen.set(true);
  }

  startEditMenu(menu: AdminMenu): void {
    this.clearMessages();
    this.editingMenuId.set(menu.id);
    // Exclude the menu itself and its descendants from the parent options (cycles).
    this.parentOptions.set(this.buildParentOptions(menu.id));
    this.menuForm.setValue({ name: menu.name, route: menu.route || '', icon: menu.icon || '', parentId: menu.parentId || '' });
    this.menuTranslations = this.buildTranslations(menu.names);
    this.menuDialogOpen.set(true);
  }

  // Depth-indented parent choices from the tree, skipping `excludeId` + its subtree.
  private buildParentOptions(excludeId: string | null): { id: string; label: string }[] {
    const out: { id: string; label: string }[] = [];
    const walk = (nodes: MenuTreeNode[], depth: number) => {
      for (const node of nodes) {
        if (node.menu.id === excludeId) continue; // skip the menu and its whole subtree
        out.push({ id: node.menu.id, label: `${'— '.repeat(depth)}${node.menu.name}` });
        walk(node.children, depth + 1);
      }
    };
    walk(this.tree(), 0);
    return out;
  }

  cancelMenuEdit(): void {
    this.menuDialogOpen.set(false);
    this.editingMenuId.set(null);
    this.menuForm.reset({ name: '', route: '', icon: '' });
  }

  saveMenu(): void {
    this.clearMessages();
    const moduleId = this.selectedModuleId();
    if (!moduleId) {
      this.errorMessage.set('Select a module first.');
      return;
    }
    if (this.menuForm.invalid) {
      this.menuForm.markAllAsTouched();
      this.errorMessage.set('Menu name and route are required.');
      return;
    }

    const { name, route, icon, parentId } = this.menuForm.getRawValue();
    const editingId = this.editingMenuId();
    const names = this.namesFrom(this.menuTranslations);
    const parent = parentId || null;

    this.savingMenu.set(true);
    const req$ = editingId
      ? this.admin.updateMenu(editingId, { name: name.trim(), route: route.trim(), icon: icon.trim(), parentId: parent, names })
      : this.admin.createMenu({ name: name.trim(), route: route.trim(), icon: icon.trim(), moduleId, parentId: parent, names });

    req$.subscribe({
      next: (res) => {
        this.successMessage.set(res.message || (editingId ? 'Menu updated.' : 'Menu created.'));
        this.savingMenu.set(false);
        this.cancelMenuEdit();
        this.loadMenus(moduleId);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save menu.');
        this.savingMenu.set(false);
      },
    });
  }

  deleteMenu(menu: AdminMenu): void {
    this.clearMessages();
    if (!confirm(`Delete the menu "${menu.name}"? Any role permissions to it are also removed.`)) return;

    const moduleId = this.selectedModuleId();
    this.deletingMenuId.set(menu.id);
    this.admin.deleteMenu(menu.id).subscribe({
      next: (res) => {
        this.successMessage.set(res.message || 'Menu deleted.');
        this.deletingMenuId.set(null);
        if (this.editingMenuId() === menu.id) this.cancelMenuEdit();
        if (moduleId) this.loadMenus(moduleId);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to delete menu.');
        this.deletingMenuId.set(null);
      },
    });
  }

  // ---------- Drag & drop: reorder a sibling set ----------

  // Reorder menus within one level (same parent). CDK mutates the bound sibling
  // array in place; we refresh the tree signal and persist the new sequence.
  dropMenu(event: CdkDragDrop<MenuTreeNode[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    this.tree.set([...this.tree()]); // array was mutated in place — refresh view
    this.persistOrder(event.container.data);
  }

  private persistOrder(siblings: MenuTreeNode[]): void {
    const moduleId = this.selectedModuleId();
    if (!moduleId) return;
    const items = siblings.map((n, i) => ({ id: n.menu.id, sequence: i }));
    this.savingLayout.set(true);
    this.admin.reorderMenus(moduleId, items).subscribe({
      next: () => this.savingLayout.set(false),
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the new order.');
        this.savingLayout.set(false);
        this.reloadLayout(); // fall back to the server's truth
      },
    });
  }

  clearModuleSearch(): void {
    this.moduleSearch.set('');
  }

  clearMenuSearch(): void {
    this.menuSearch.set('');
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
