import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MenuItem } from '../models/auth.models';
import { I18nService } from '../i18n/i18n.service';
import { HelpService } from '../services/help.service';
import { RecentScreensService } from '../services/recent-screens.service';

// The landing page of a system (Membership, Golf, Facility…) - a personal
// launchpad, NOT an analytics dashboard (analytics live behind their own
// RBAC-gated screens, e.g. Business Insights). Everything here is derived
// from what the user already has, so it needs no RBAC of its own:
//  - quick-access tiles come from the login's granted-menu cache (the same
//    source as the sidebar - already filtered, translated, icon'd);
//  - "continue where you left off" is the user's own visit history, re-checked
//    against the current grants (RecentScreensService);
//  - guides list the granted screens that have a published user manual.
// One component serves every system route via route `data`
// (systemModule/title/icon/blurb).
@Component({
  selector: 'app-system-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './system-dashboard.html',
  // system-setup.css supplies the shared .saas-container/.saas-header chrome
  // (component-scoped, not global - every screen must include it itself).
  styleUrls: ['../system-setup/system-setup.css', './system-dashboard.css'],
})
export class SystemDashboardComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly i18n = inject(I18nService);
  private readonly help = inject(HelpService);
  private readonly recents = inject(RecentScreensService);

  readonly moduleName = signal('');
  readonly fallbackTitle = signal('Dashboard');
  readonly icon = signal('dashboard');
  readonly blurb = signal('');

  // Re-evaluated when the route data changes (navigating between systems that
  // reuse this component recreates none of it - the signals just update).
  constructor() {
    this.route.data.pipe(takeUntilDestroyed()).subscribe((d) => {
      this.moduleName.set(d['systemModule'] || '');
      this.fallbackTitle.set(d['title'] || 'Dashboard');
      this.icon.set(d['icon'] || 'dashboard');
      this.blurb.set(d['blurb'] || '');
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

  // --- Granted menus of this module ----------------------------------------
  private readonly grantedMenus = signal<MenuItem[]>((() => {
    try {
      return JSON.parse(localStorage.getItem('userMenus') || '[]');
    } catch {
      return [];
    }
  })());

  private readonly moduleMenus = computed(() =>
    this.grantedMenus().filter((m) => m.moduleName === this.moduleName()),
  );

  // Localized module title for the header (any menu carries moduleNames).
  readonly title = computed(() => {
    const lang = this.i18n.lang();
    const menu = this.moduleMenus()[0];
    return menu?.moduleNames?.[lang] || this.moduleName() || this.fallbackTitle();
  });

  // Quick-access tiles: the module's navigable menus in SIDEBAR order (roots by
  // sequence, then each group's children) - group headers without a route are
  // skipped, their children surface as tiles.
  readonly tiles = computed<MenuItem[]>(() => {
    const menus = this.moduleMenus();
    const bySeq = (a: MenuItem, b: MenuItem) => (a.sequence ?? 0) - (b.sequence ?? 0);
    const ids = new Set(menus.map((m) => m.id).filter(Boolean));
    const childrenOf = (parentId: string | null | undefined) =>
      menus
        .filter((m) => (m.parentId && ids.has(m.parentId) ? m.parentId : null) === (parentId ?? null))
        .sort(bySeq);
    const out: MenuItem[] = [];
    const walk = (parentId: string | null) => {
      for (const m of childrenOf(parentId)) {
        if (m.route) out.push(m);
        if (m.id) walk(m.id);
      }
    };
    walk(null);
    return out;
  });

  // "Continue where you left off" - this module's recently visited screens.
  readonly recentMenus = computed(() => {
    this.i18n.lang(); // re-render labels on language change
    return this.recents.list(this.moduleName(), 5);
  });

  // Granted screens with a published user manual (Book icon lights up there).
  readonly guideMenus = computed(() => this.tiles().filter((m) => this.help.manualSlugFor(m.route) !== null));

  // --- Label helpers (localized like the sidebar) ---------------------------
  label(menu: MenuItem): string {
    const lang = this.i18n.lang();
    return menu.names?.[lang] || menu.name;
  }

  description(menu: MenuItem): string {
    const lang = this.i18n.lang();
    return menu.descriptions?.[lang] || menu.description || '';
  }
}
