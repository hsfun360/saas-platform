import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminService } from '../services/admin.service';
import { AdminMenu, AdminModule } from '../models/auth.models';
import { DialogComponent } from '../shared/dialog/dialog';

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
  imports: [ReactiveFormsModule, DialogComponent],
  templateUrl: './modules-menus.html',
  styleUrls: ['./modules-menus.css'],
})
export class ModulesMenusComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly fb = inject(FormBuilder);
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
  }

  private applySelection(moduleId: string | null): void {
    this.selectedModuleId.set(moduleId);
    this.menuSearch.set(''); // don't carry a filter across modules
    this.cancelMenuEdit();
    if (moduleId) {
      this.loadMenus(moduleId);
    } else {
      this.menus.set([]);
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
    const payload = { name: name.trim(), icon: icon.trim(), description: description.trim(), landingRoute: landingRoute.trim() };
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
      next: (list) => {
        this.menus.set(list);
        this.menusLoading.set(false);
      },
      error: () => this.menusLoading.set(false),
    });
  }

  startCreateMenu(): void {
    this.clearMessages();
    this.editingMenuId.set(null);
    this.menuForm.reset({ name: '', route: '', icon: '' });
    this.menuDialogOpen.set(true);
  }

  startEditMenu(menu: AdminMenu): void {
    this.clearMessages();
    this.editingMenuId.set(menu.id);
    this.menuForm.setValue({ name: menu.name, route: menu.route || '', icon: menu.icon || '' });
    this.menuDialogOpen.set(true);
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

    const { name, route, icon } = this.menuForm.getRawValue();
    const editingId = this.editingMenuId();

    this.savingMenu.set(true);
    const req$ = editingId
      ? this.admin.updateMenu(editingId, { name: name.trim(), route: route.trim(), icon: icon.trim() })
      : this.admin.createMenu({ name: name.trim(), route: route.trim(), icon: icon.trim(), moduleId });

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
