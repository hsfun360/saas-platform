import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { MenuItem } from '../models/auth.models';

// Starred screens - the user's own picks for My Dashboard's "Quick access",
// starred via the <app-fav-star> button beside each screen title.
//
// Persisted SERVER-SIDE (UserFavorite, per user + workspace) so favorites
// follow the user across devices - /api/auth/my/favorites GET + PUT (the whole
// ordered list is PUT-replaced on every toggle/reorder). The server stores
// MENU IDS (rename-safe); this service translates to/from routes for the UI.
// RBAC-safe by construction: only granted menu routes can be starred, and
// every read resolves ids against the CURRENT granted-menu cache, so a
// revoked screen drops out silently.
//
// One-time migration: favorites used to live in localStorage
// (favoriteScreens:<email> as routes). If the server list is empty and a
// legacy list exists, it is pushed up once and the legacy key removed.

const LEGACY_KEY_PREFIX = 'favoriteScreens:';

function grantedMenus(): MenuItem[] {
  try {
    return JSON.parse(localStorage.getItem('userMenus') || '[]');
  } catch {
    return [];
  }
}

@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/auth/my/favorites`;

  // Star order = the user's sort order (menu ids, as stored server-side).
  private readonly menuIds = signal<string[]>([]);
  private loadRequested = false;

  // Routes of the starred menus, for the fav-star buttons.
  readonly routeSet = computed(() => {
    const menus = grantedMenus();
    const byId = new Map(menus.filter((m) => m.id).map((m) => [m.id as string, m.route]));
    return new Set(this.menuIds().map((id) => byId.get(id)).filter((r): r is string => !!r));
  });

  // Fetch once per session; callers (fav-star, My Dashboard) invoke freely.
  ensureLoaded(): void {
    if (this.loadRequested) return;
    this.loadRequested = true;
    this.http.get<{ menuIds: string[] }>(this.base).subscribe({
      next: (r) => {
        const serverIds = Array.isArray(r.menuIds) ? r.menuIds : [];
        if (serverIds.length === 0) {
          const legacy = this.readLegacy();
          if (legacy.length) {
            this.menuIds.set(legacy);
            this.persist(legacy);
            this.clearLegacy();
            return;
          }
        }
        this.menuIds.set(serverIds);
      },
      error: () => {
        // Endpoint unreachable (offline / older API) - fall back to legacy so
        // the page still works; nothing is written server-side.
        this.menuIds.set(this.readLegacy());
        this.loadRequested = false; // allow a retry on the next consumer
      },
    });
  }

  isFavorite(route: string): boolean {
    return this.routeSet().has(route);
  }

  toggle(route: string): void {
    const menu = grantedMenus().find((m) => m.route === route);
    if (!menu?.id) return;
    const current = this.menuIds();
    const next = current.includes(menu.id)
      ? current.filter((id) => id !== menu.id)
      : [...current, menu.id];
    this.menuIds.set(next); // optimistic - the star flips immediately
    this.persist(next, current);
  }

  // Replace the whole ordered list (the My Dashboard manage dialog's Save).
  reorder(menuIds: string[]): void {
    const previous = this.menuIds();
    this.menuIds.set(menuIds);
    this.persist(menuIds, previous);
  }

  // The starred screens as granted MenuItems, in starred order. Ids whose
  // grant is gone (or that aren't in this login's cache) are skipped.
  list(menus: MenuItem[]): MenuItem[] {
    const out: MenuItem[] = [];
    for (const id of this.menuIds()) {
      const menu = menus.find((m) => m.id === id);
      if (menu) out.push(menu);
    }
    return out;
  }

  private persist(menuIds: string[], rollback?: string[]): void {
    this.http.put<{ menuIds: string[] }>(this.base, { menuIds }).subscribe({
      next: (r) => {
        // The server may have dropped stale ids - adopt its validated list.
        if (Array.isArray(r.menuIds)) this.menuIds.set(r.menuIds);
      },
      error: () => {
        if (rollback) this.menuIds.set(rollback);
      },
    });
  }

  private legacyKey(): string {
    return `${LEGACY_KEY_PREFIX}${localStorage.getItem('userEmail') || 'anonymous'}`;
  }

  private readLegacy(): string[] {
    try {
      const routes = JSON.parse(localStorage.getItem(this.legacyKey()) || '[]');
      if (!Array.isArray(routes)) return [];
      const menus = grantedMenus();
      return routes
        .map((route) => menus.find((m) => m.route === route)?.id)
        .filter((id): id is string => !!id);
    } catch {
      return [];
    }
  }

  private clearLegacy(): void {
    try {
      localStorage.removeItem(this.legacyKey());
    } catch {
      // ignore
    }
  }
}
