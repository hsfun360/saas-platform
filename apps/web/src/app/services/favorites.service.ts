import { Injectable, computed, signal } from '@angular/core';
import { MenuItem } from '../models/auth.models';

// Starred screens - the user's own picks for the My Dashboard "Quick access"
// section. Starred via the <app-fav-star> button beside each screen title.
// Per-user localStorage (personal convenience data, like recent screens) and
// RBAC-safe by construction: only granted menu routes can be starred (the star
// only renders on menu-backed screens), and list() re-validates against the
// CURRENT granted-menu cache, so a revoked screen drops out silently.

function storageKey(): string {
  return `favoriteScreens:${localStorage.getItem('userEmail') || 'anonymous'}`;
}

function load(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey()) || '[]');
    return Array.isArray(raw) ? raw.filter((r): r is string => typeof r === 'string') : [];
  } catch {
    return [];
  }
}

@Injectable({ providedIn: 'root' })
export class FavoritesService {
  // Star order = the order screens were starred (stable on the dashboard).
  private readonly routes = signal<string[]>(load());

  readonly routeSet = computed(() => new Set(this.routes()));

  isFavorite(route: string): boolean {
    return this.routeSet().has(route);
  }

  toggle(route: string): void {
    const next = this.routes().filter((r) => r !== route);
    if (next.length === this.routes().length) next.push(route);
    this.routes.set(next);
    try {
      localStorage.setItem(storageKey(), JSON.stringify(next));
    } catch {
      // Storage full/unavailable - favorites are a convenience, never an error.
    }
  }

  // The starred screens as granted MenuItems, in starred order. Routes whose
  // grant is gone (or that aren't in this login's cache) are skipped.
  list(menus: MenuItem[]): MenuItem[] {
    const out: MenuItem[] = [];
    for (const route of this.routes()) {
      const menu = menus.find((m) => m.route === route);
      if (menu) out.push(menu);
    }
    return out;
  }
}
