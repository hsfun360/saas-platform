import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MenuItem } from '../../models/auth.models';
import { I18nService } from '../../i18n/i18n.service';
import { HelpService } from '../../services/help.service';
import { RecentScreensService } from '../../services/recent-screens.service';
import { FavoritesService } from '../../services/favorites.service';
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
// Module-scoped orientation (all screens of one system) lives on the module
// landing (SystemDashboardComponent). The future workflow "my approvals /
// my tasks" inbox belongs HERE - it is user-scoped, like everything else.
@Component({
  selector: 'app-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DialogComponent],
  templateUrl: './home.html',
  // system-setup.css supplies the shared .saas-container/.saas-header chrome;
  // system-dashboard.css the launchpad primitives (both component-scoped).
  styleUrls: ['../../system-setup/system-setup.css', '../../systems/system-dashboard.css', './home.css'],
})
export class HomeComponent {
  private readonly i18n = inject(I18nService);
  private readonly help = inject(HelpService);
  private readonly recents = inject(RecentScreensService);
  private readonly favorites = inject(FavoritesService);

  constructor() {
    this.favorites.ensureLoaded();
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

  // Quick access = starred screens, grouped by module (module order follows
  // the granted-menu cache, i.e. the platform's module ordering; the user's
  // starred sequence orders the tiles WITHIN each module).
  readonly favoriteGroups = computed<FavoriteGroup[]>(() => {
    this.i18n.lang(); // re-render labels on language change
    const menus = this.grantedMenus();
    const favs = this.favorites.list(menus);
    const groups = new Map<string, FavoriteGroup>();
    // Seed group order from the menu cache so modules appear consistently.
    for (const m of menus) {
      const key = m.moduleName || '';
      if (!groups.has(key)) {
        groups.set(key, {
          moduleName: key,
          moduleLabel: this.moduleLabel(m),
          moduleIcon: m.moduleIcon || 'apps',
          tiles: [],
        });
      }
    }
    for (const fav of favs) groups.get(fav.moduleName || '')?.tiles.push(fav);
    return [...groups.values()].filter((g) => g.tiles.length > 0);
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

  // --- Manage dialog (reorder / remove) -------------------------------------
  readonly manageOpen = signal(false);
  readonly manageList = signal<MenuItem[]>([]);
  private manageOriginalIds: string[] = [];

  readonly manageDirty = computed(() => {
    const ids = this.manageList().map((m) => m.id);
    return JSON.stringify(ids) !== JSON.stringify(this.manageOriginalIds);
  });

  openManage(): void {
    const list = this.favorites.list(this.grantedMenus());
    this.manageList.set(list);
    this.manageOriginalIds = list.map((m) => m.id as string);
    this.manageOpen.set(true);
  }

  moveManaged(index: number, delta: number): void {
    const list = [...this.manageList()];
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    this.manageList.set(list);
  }

  removeManaged(index: number): void {
    this.manageList.set(this.manageList().filter((_, i) => i !== index));
  }

  saveManage(): void {
    this.favorites.reorder(this.manageList().map((m) => m.id as string));
    this.manageOpen.set(false);
  }
}
