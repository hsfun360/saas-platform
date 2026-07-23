import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CdkDropList,
  CdkDrag,
  CdkDragHandle,
  CdkDragDrop,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { MenuItem } from '../../models/auth.models';
import { I18nService } from '../../i18n/i18n.service';
import { HelpService } from '../../services/help.service';
import { RecentScreensService } from '../../services/recent-screens.service';
import { FavoritesService } from '../../services/favorites.service';
import { WorkflowService } from '../../services/workflow.service';
import { DialogComponent } from '../../shared/dialog/dialog';

// One Quick-access group: a module and the user's starred screens inside it.
interface FavoriteGroup {
  moduleName: string;
  moduleLabel: string;
  moduleIcon: string;
  tiles: MenuItem[];
}

// My Dashboard (/home) - the user's PERSONAL page, identical whichever system
// they are in (the sidebar "My Dashboard" link points here). Person-scoped by
// design, so it needs no RBAC of its own:
//  - Quick access = the screens the user STARRED (fav-star beside each screen
//    title), server-persisted per user+workspace so it follows them across
//    devices, displayed GROUPED BY MODULE, reordered via the Manage dialog;
//  - "Continue where you left off" = their own cross-module visit history;
//  - Help & guides = granted screens with a published manual.
// This is the ONE home page - the per-system launchpad landings were removed
// 2026-07-23 (switching systems lands here). The future workflow "my approvals /
// my tasks" inbox belongs HERE - it is user-scoped, like everything else.
@Component({
  selector: 'app-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DialogComponent, CdkDropList, CdkDrag, CdkDragHandle],
  templateUrl: './home.html',
  // system-setup.css supplies the shared .saas-container/.saas-header chrome;
  // launchpad.css the tile/hero primitives (both component-scoped).
  styleUrls: ['../../system-setup/system-setup.css', './launchpad.css', './home.css'],
})
export class HomeComponent {
  private readonly i18n = inject(I18nService);
  private readonly help = inject(HelpService);
  private readonly recents = inject(RecentScreensService);
  private readonly favorites = inject(FavoritesService);
  private readonly workflow = inject(WorkflowService);

  // My Approvals inbox badge (person-scoped, so it belongs on this page).
  // Silently 0 on error - the tile simply stays hidden.
  readonly pendingApprovals = signal(0);

  constructor() {
    this.favorites.ensureLoaded();
    this.workflow.countMyTasks().subscribe({
      next: (r) => this.pendingApprovals.set(r.count),
      error: () => this.pendingApprovals.set(0),
    });
  }

  // --- Who/where (greeting) -------------------------------------------------
  readonly userName = signal(localStorage.getItem('userFullName') || '');
  readonly roleName = signal(localStorage.getItem('userRole') || '');

  readonly companyName = signal<string>((() => {
    // The active workspace name rides on the JWT payload (set at login/switch).
    try {
      const token = localStorage.getItem('token');
      if (!token) return '';
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return typeof payload.companyName === 'string' ? payload.companyName : '';
    } catch {
      return '';
    }
  })());

  readonly greeting = signal<string>((() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })());

  // --- Granted menus (the RBAC-filtered universe this page derives from) ----
  private readonly grantedMenus = signal<MenuItem[]>((() => {
    try {
      return JSON.parse(localStorage.getItem('userMenus') || '[]');
    } catch {
      return [];
    }
  })());

  // --- Quick access view state (device-local UI preference, per user) -------
  // Hidden = the eye toggle collapses the whole section to just its title.
  readonly qaHidden = signal<boolean>(localStorage.getItem(this.qaHiddenKey()) === '1');
  // Collapsed module groups within Quick access.
  readonly qaCollapsed = signal<Set<string>>((() => {
    try {
      const raw = JSON.parse(localStorage.getItem(this.qaCollapsedKey()) || '[]');
      return new Set(Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : []);
    } catch {
      return new Set<string>();
    }
  })());

  private qaHiddenKey(): string {
    return `homeQuickAccessHidden:${localStorage.getItem('userEmail') || 'anonymous'}`;
  }

  private qaCollapsedKey(): string {
    return `homeQuickAccessCollapsed:${localStorage.getItem('userEmail') || 'anonymous'}`;
  }

  toggleQaHidden(): void {
    const next = !this.qaHidden();
    this.qaHidden.set(next);
    try {
      localStorage.setItem(this.qaHiddenKey(), next ? '1' : '0');
    } catch { /* view preference only */ }
  }

  toggleQaGroup(moduleName: string): void {
    const next = new Set(this.qaCollapsed());
    if (next.has(moduleName)) next.delete(moduleName);
    else next.add(moduleName);
    this.qaCollapsed.set(next);
    try {
      localStorage.setItem(this.qaCollapsedKey(), JSON.stringify([...next]));
    } catch { /* view preference only */ }
  }

  isQaCollapsed(moduleName: string): boolean {
    return this.qaCollapsed().has(moduleName);
  }

  // Quick access = starred screens, grouped by module. BOTH orders are the
  // user's own saved sequence (one flat server-side list): a module group's
  // position = the first occurrence of any of its screens in the sequence
  // (so dragging a group in Manage persists through the same flat list), and
  // the sequence orders the tiles WITHIN each module.
  readonly favoriteGroups = computed<FavoriteGroup[]>(() => {
    this.i18n.lang(); // re-render labels on language change
    const favs = this.favorites.list(this.grantedMenus());
    const groups = new Map<string, FavoriteGroup>(); // Map keeps first-occurrence order
    for (const fav of favs) {
      const key = fav.moduleName || '';
      let group = groups.get(key);
      if (!group) {
        group = {
          moduleName: key,
          moduleLabel: this.moduleLabel(fav),
          moduleIcon: fav.moduleIcon || 'apps',
          tiles: [],
        };
        groups.set(key, group);
      }
      group.tiles.push(fav);
    }
    return [...groups.values()];
  });

  readonly hasFavorites = computed(() => this.favoriteGroups().length > 0);

  // Cross-module recently visited screens.
  readonly recentMenus = computed(() => {
    this.i18n.lang();
    return this.recents.list(undefined, 8);
  });

  // Granted screens with a published user manual.
  readonly guideMenus = computed(() =>
    this.grantedMenus().filter((m) => m.route && this.help.manualSlugFor(m.route) !== null),
  );

  // --- Label helpers (localized like the sidebar) ---------------------------
  label(menu: MenuItem): string {
    const lang = this.i18n.lang();
    return menu.names?.[lang] || menu.name;
  }

  description(menu: MenuItem): string {
    const lang = this.i18n.lang();
    return menu.descriptions?.[lang] || menu.description || '';
  }

  moduleLabel(menu: MenuItem): string {
    const lang = this.i18n.lang();
    return menu.moduleNames?.[lang] || menu.moduleName || '';
  }

  unpin(route: string): void {
    this.favorites.toggle(route);
  }

  // --- Manage dialog (Menu-setup look: collapsible module blocks, drag to ---
  // --- sort within a module, remove) ----------------------------------------
  readonly manageOpen = signal(false);
  readonly manageGroups = signal<FavoriteGroup[]>([]);
  readonly manageCollapsed = signal<Set<string>>(new Set());
  private manageOriginalIds: string[] = [];

  private flattenManaged(): string[] {
    return this.manageGroups().flatMap((g) => g.tiles.map((m) => m.id as string));
  }

  readonly manageDirty = computed(() => {
    // Depend on the groups signal; tiles arrays are replaced on every change.
    this.manageGroups();
    return JSON.stringify(this.flattenManaged()) !== JSON.stringify(this.manageOriginalIds);
  });

  openManage(): void {
    // Working copy of the current groups (fresh arrays so drag never mutates
    // what the page behind the dialog is rendering).
    const groups = this.favoriteGroups().map((g) => ({ ...g, tiles: [...g.tiles] }));
    this.manageGroups.set(groups);
    this.manageCollapsed.set(new Set());
    this.manageOriginalIds = groups.flatMap((g) => g.tiles.map((m) => m.id as string));
    this.manageOpen.set(true);
  }

  toggleManageGroup(moduleName: string): void {
    const next = new Set(this.manageCollapsed());
    if (next.has(moduleName)) next.delete(moduleName);
    else next.add(moduleName);
    this.manageCollapsed.set(next);
  }

  isManageCollapsed(moduleName: string): boolean {
    return this.manageCollapsed().has(moduleName);
  }

  // Drag lands within its own module's list (lists are not connected).
  dropManaged(event: CdkDragDrop<MenuItem[]>, group: FavoriteGroup): void {
    if (event.previousIndex === event.currentIndex) return;
    moveItemInArray(group.tiles, event.previousIndex, event.currentIndex);
    this.manageGroups.set(this.manageGroups().map((g) => (g === group ? { ...g, tiles: [...g.tiles] } : g)));
  }

  // Drag a whole module group by its header handle - Save persists the new
  // order through the same flat list (groups flatten top-to-bottom).
  dropGroup(event: CdkDragDrop<FavoriteGroup[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const groups = [...this.manageGroups()];
    moveItemInArray(groups, event.previousIndex, event.currentIndex);
    this.manageGroups.set(groups);
  }

  removeManaged(group: FavoriteGroup, index: number): void {
    const tiles = group.tiles.filter((_, i) => i !== index);
    this.manageGroups.set(
      this.manageGroups()
        .map((g) => (g === group ? { ...g, tiles } : g))
        .filter((g) => g.tiles.length > 0),
    );
  }

  saveManage(): void {
    this.favorites.reorder(this.flattenManaged());
    this.manageOpen.set(false);
  }
}
