import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MenuItem } from '../models/auth.models';
import { I18nService } from '../i18n/i18n.service';

// The landing page of a system (Membership, Golf, Facility…) - MODULE
// orientation only: the screens the caller's role has in THIS system, as
// tiles in sidebar order. Person-scoped content (greeting, starred quick
// access, recents, guides, the future approvals inbox) lives on My Dashboard
// (/home, HomeComponent) - one page regardless of module (user decision
// 2026-07-22). Everything here derives from the granted-menu cache, so it
// needs no RBAC of its own. One component serves every system route via
// route `data` (systemModule/title/icon/blurb); answers on both /x and
// /x/dashboard (the Control-Plane Module.landingRoute convention).
@Component({
  selector: 'app-system-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  // system-setup.css supplies the shared .saas-container/.saas-header chrome
  // (component-scoped, not global - every screen must include it itself).
  styleUrls: ['../system-setup/system-setup.css', './system-dashboard.css'],
  templateUrl: './system-dashboard.html',
})
export class SystemDashboardComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly i18n = inject(I18nService);

  readonly moduleName = signal('');
  readonly fallbackTitle = signal('Dashboard');
  readonly icon = signal('dashboard');
  readonly blurb = signal('');

  constructor() {
    this.route.data.pipe(takeUntilDestroyed()).subscribe((d) => {
      this.moduleName.set(d['systemModule'] || '');
      this.fallbackTitle.set(d['title'] || 'Dashboard');
      this.icon.set(d['icon'] || 'dashboard');
      this.blurb.set(d['blurb'] || '');
    });
  }

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

  // The module's navigable menus in SIDEBAR order (roots by sequence, then each
  // group's children) - group headers without a route are skipped, their
  // children surface as tiles.
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
