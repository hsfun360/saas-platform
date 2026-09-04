import { Injectable } from '@angular/core';
import { MenuItem } from '../models/auth.models';

// Frontend view of "which systems can this user reach", keyed by the frozen
// Module.code shipped on each granted menu, plus the admin areas a Tenant
// Admin / System Admin gets. Used by the route guard so a user can't URL-hop
// into a system they don't have. The backend remains the authoritative gate on
// data (requireModule + RBAC) — this is for UX/route safety.

// Menu caches stored at login BEFORE Module.code shipped carry only display
// names. Map those to codes so an already-signed-in user keeps working until
// their next login refreshes the cache; removable once every session has
// re-logged in.
const LEGACY_NAME_TO_CODE: Record<string, string> = {
  'Membership Management': 'MEMBERSHIP',
  'Golf Management': 'GOLF',
  'Facility Management': 'FACILITY',
  'Account Receivable': 'AR',
  'POS': 'POS',
  'System Setup': 'TENANT_ADMIN',
  'System Administration': 'TENANT_ADMIN',
  'SaaS Administration': 'PLATFORM_ADMIN',
};

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

  // The set of module CODES the user can access.
  accessibleModules(): Set<string> {
    const set = new Set<string>();
    for (const m of this.getMenus()) {
      if (m.moduleCode) set.add(m.moduleCode);
      else if (m.moduleName && LEGACY_NAME_TO_CODE[m.moduleName]) set.add(LEGACY_NAME_TO_CODE[m.moduleName]);
    }
    // Admin areas the shell surfaces client-side:
    if (this.isTenantAdmin() || this.isSystemAdmin()) set.add('TENANT_ADMIN');
    if (this.isSystemAdmin()) set.add('PLATFORM_ADMIN');
    return set;
  }

  // No module restriction → allow. Otherwise the user must have that module.
  canAccessModule(moduleCode: string | undefined | null): boolean {
    if (!moduleCode) return true;
    return this.accessibleModules().has(moduleCode);
  }
}
