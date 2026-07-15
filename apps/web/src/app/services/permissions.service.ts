import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MenuItem } from '../models/auth.models';
import { AccessService } from './access.service';

// What a role may DO on the current screen, resolved from the granted menus
// the login stored (each MenuItem now carries `actions`). This powers UI
// gating only (hide Create/Edit/Delete controls the role doesn't have) — the
// backend's requireMenuAction middleware is the authoritative enforcement.
export type MenuAction = 'create' | 'edit' | 'delete';

@Injectable({ providedIn: 'root' })
export class PermissionsService {
  private readonly router = inject(Router);
  private readonly access = inject(AccessService);

  private grantedMenus(): MenuItem[] {
    try {
      return JSON.parse(localStorage.getItem('userMenus') || '[]');
    } catch {
      return [];
    }
  }

  // May the current user perform `action` on the screen at `url` (defaults to
  // the current route)? Resolution mirrors HelpService: exact route match
  // first, then progressively drop trailing segments so `/x/:id` detail routes
  // inherit `/x`'s grant.
  //
  // Defaults are deliberately permissive: admins (implicit full access), menus
  // cached before actions shipped, and screens that aren't in the menu
  // catalogue all resolve to true — the backend still enforces. Gating only
  // kicks in when a menu grant explicitly withholds the action.
  can(action: MenuAction, url?: string): boolean {
    if (this.access.isSystemAdmin() || this.access.isTenantAdmin()) return true;

    const menus = this.grantedMenus();
    if (!menus.length) return true;

    const path = (url ?? this.router.url).split('?')[0].split('#')[0];
    const segments = path.split('/').filter(Boolean);
    for (let take = segments.length; take >= 1; take--) {
      const candidate = '/' + segments.slice(0, take).join('/');
      const menu = menus.find((m) => m.route === candidate);
      if (menu) {
        if (!menu.actions) return true; // pre-flag cached session
        return menu.actions[action] !== false;
      }
    }
    return true; // screen not in the catalogue -> nothing to gate
  }
}
