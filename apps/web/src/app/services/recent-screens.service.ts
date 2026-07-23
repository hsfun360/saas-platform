import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { MenuItem } from '../models/auth.models';
import { tokenIdentity } from '../shared/user-identity';

// "Continue where you left off" - remembers which GRANTED screens the user
// actually visited, per user, on this device (localStorage; personal
// convenience data, so no backend table). RBAC-safe by construction:
//  - only urls that resolve to a menu in the login's granted-menu cache are
//    recorded (resolution mirrors PermissionsService: exact route, then drop
//    trailing segments so /x/:id records as /x);
//  - list() re-checks against the CURRENT cache, so a screen whose grant was
//    revoked disappears from the row on the next login.
// The shell injects this service so tracking runs from the first navigation.

interface RecentVisit {
  route: string; // the granted menu's route (not the raw url)
  ts: number;
}

const MAX_ENTRIES = 12;

// Keyed by the JWT's userId (not the loosely-managed 'userEmail' item), so a
// user switch in the same browser can never read or write another person's
// history. Not workspace-scoped on purpose: it is the same person, and list()
// re-validates every route against the CURRENT granted-menu cache anyway.
function storageKey(): string | null {
  const identity = tokenIdentity();
  return identity ? `recentScreens:${identity.userId}` : null;
}

function grantedMenus(): MenuItem[] {
  try {
    return JSON.parse(localStorage.getItem('userMenus') || '[]');
  } catch {
    return [];
  }
}

@Injectable({ providedIn: 'root' })
export class RecentScreensService {
  private readonly router = inject(Router);

  constructor() {
    this.record(this.router.url);
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        map((e) => e.urlAfterRedirects),
        takeUntilDestroyed(),
      )
      .subscribe((url) => this.record(url));
  }

  // Resolve a url to a granted menu route, or null when it isn't menu-backed.
  private menuRouteFor(url: string): string | null {
    const path = url.split('?')[0].split('#')[0];
    const segments = path.split('/').filter(Boolean);
    const menus = grantedMenus();
    for (let take = segments.length; take >= 1; take--) {
      const candidate = '/' + segments.slice(0, take).join('/');
      if (menus.some((m) => m.route === candidate)) return candidate;
    }
    return null;
  }

  private record(url: string): void {
    const key = storageKey();
    if (!key) return; // signed out - never record
    const route = this.menuRouteFor(url);
    if (!route) return;
    const visits = this.load().filter((v) => v.route !== route);
    visits.unshift({ route, ts: Date.now() });
    try {
      localStorage.setItem(key, JSON.stringify(visits.slice(0, MAX_ENTRIES)));
    } catch {
      // Storage full/unavailable - recents are a convenience, never an error.
    }
  }

  private load(): RecentVisit[] {
    const key = storageKey();
    if (!key) return [];
    try {
      const raw = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  // Most-recent-first menus the user visited, re-validated against the current
  // granted-menu cache. Optionally limited to one module's screens.
  list(moduleName?: string, limit = 5): MenuItem[] {
    const menus = grantedMenus();
    const result: MenuItem[] = [];
    for (const visit of this.load()) {
      const menu = menus.find((m) => m.route === visit.route);
      if (!menu) continue; // grant revoked (or cache refreshed) -> drop
      if (moduleName && menu.moduleName !== moduleName) continue;
      result.push(menu);
      if (result.length >= limit) break;
    }
    return result;
  }
}
