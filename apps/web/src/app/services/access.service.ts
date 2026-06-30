import { Injectable } from '@angular/core';
import { MenuItem } from '../models/auth.models';

// Frontend view of "which systems can this user reach", mirroring how the shell
// builds its apps switcher: from the backend-granted menus (their moduleName) plus
// the admin areas a Tenant Admin / System Admin gets. Used by the route guard so a
// user can't URL-hop into a system they don't have. The backend remains the
// authoritative gate on data (requireModule + RBAC) — this is for UX/route safety.
@Injectable({ providedIn: 'root' })
export class AccessService {
  private getMenus(): MenuItem[] {
    try {
      return JSON.parse(localStorage.getItem('userMenus') || '[]');
    } catch {
      return [];
    }
  }

  isSystemAdmin(): boolean {
    const token = localStorage.getItem('token');
    if (!token) return false;
    try {
      return !!JSON.parse(atob(token.split('.')[1])).isSystemAdmin;
    } catch {
      return false;
    }
  }

  isTenantAdmin(): boolean {
    return localStorage.getItem('userRole') === 'Tenant Admin';
  }

  // The set of system (module) names the user can access.
  accessibleModules(): Set<string> {
    const set = new Set<string>();
    for (const m of this.getMenus()) {
      if (m.moduleName) set.add(m.moduleName);
    }
    // Admin areas the shell surfaces client-side:
    if (this.isTenantAdmin() || this.isSystemAdmin()) set.add('System Setup');
    if (this.isSystemAdmin()) set.add('SaaS Administration');
    return set;
  }

  // No module restriction → allow. Otherwise the user must have that module.
  canAccessModule(moduleName: string | undefined | null): boolean {
    if (!moduleName) return true;
    return this.accessibleModules().has(moduleName);
  }
}
