import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MenuItem } from '../../models/auth.models';
import { I18nService } from '../../i18n/i18n.service';
import { HelpService } from '../../services/help.service';
import { RecentScreensService } from '../../services/recent-screens.service';
import { FavoritesService } from '../../services/favorites.service';

// My Dashboard (/home) - the user's PERSONAL page, identical whichever system
// they are in (the sidebar "My Dashboard" link points here). Person-scoped by
// design, so it needs no RBAC of its own:
//  - Quick access = the screens the user STARRED (fav-star beside each screen
//    title), re-validated against the current granted-menu cache;
//  - "Continue where you left off" = their own cross-module visit history;
//  - Help & guides = granted screens with a published manual.
// Module-scoped orientation (all screens of one system) lives on the module
// landing (SystemDashboardComponent). The future workflow "my approvals /
// my tasks" inbox belongs HERE - it is user-scoped, like everything else.
@Component({
  selector: 'app-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
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

  // Quick access = starred screens, in starred order, grants re-checked.
  readonly quickAccess = computed(() => {
    this.i18n.lang(); // re-render labels on language change
    return this.favorites.list(this.grantedMenus());
  });

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
}
