import { TestBed } from '@angular/core/testing';

import { AccessService } from './access.service';
import { MenuItem } from '../models/auth.models';

// A JWT whose payload carries the given claims (signature is never checked client-side).
function fakeJwt(claims: Record<string, unknown>): string {
  return `header.${btoa(JSON.stringify(claims))}.signature`;
}

function storeMenus(menus: Partial<MenuItem>[]): void {
  localStorage.setItem('userMenus', JSON.stringify(menus));
}

describe('AccessService', () => {
  let service: AccessService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(AccessService);
  });

  afterEach(() => localStorage.clear());

  it('allows any route that carries no module restriction', () => {
    expect(service.canAccessModule(undefined)).toBe(true);
    expect(service.canAccessModule(null)).toBe(true);
    expect(service.canAccessModule('')).toBe(true);
  });

  it('grants a module when one of the granted menus carries its code, and denies the rest', () => {
    storeMenus([
      { name: 'Courses', route: '/golf/courses', moduleCode: 'GOLF' },
      { name: 'Memberships', route: '/membership/memberships', moduleCode: 'MEMBERSHIP' },
    ]);

    expect(service.canAccessModule('GOLF')).toBe(true);
    expect(service.canAccessModule('MEMBERSHIP')).toBe(true);
    expect(service.canAccessModule('AR')).toBe(false);
    expect(service.canAccessModule('TENANT_ADMIN')).toBe(false);
    expect(service.canAccessModule('PLATFORM_ADMIN')).toBe(false);
  });

  it('maps a legacy pre-code menu cache (display names only) onto module codes', () => {
    storeMenus([
      { name: 'Memberships', route: '/membership/memberships', moduleName: 'Membership Management' },
      { name: 'Roles', route: '/admin/roles', moduleName: 'System Setup' },
    ]);

    expect(service.accessibleModules()).toEqual(new Set(['MEMBERSHIP', 'TENANT_ADMIN']));
  });

  it('a Tenant Admin gets TENANT_ADMIN but not PLATFORM_ADMIN', () => {
    localStorage.setItem('userRole', 'Tenant Admin');

    expect(service.isTenantAdmin()).toBe(true);
    expect(service.isSystemAdmin()).toBe(false);
    expect(service.canAccessModule('TENANT_ADMIN')).toBe(true);
    expect(service.canAccessModule('PLATFORM_ADMIN')).toBe(false);
  });

  it('a System Admin (isSystemAdmin claim in the JWT) gets both admin areas', () => {
    localStorage.setItem('token', fakeJwt({ sub: 'u1', isSystemAdmin: true }));

    expect(service.isSystemAdmin()).toBe(true);
    expect(service.canAccessModule('TENANT_ADMIN')).toBe(true);
    expect(service.canAccessModule('PLATFORM_ADMIN')).toBe(true);
  });

  it('a JWT without the claim, or a malformed token, is not a System Admin', () => {
    localStorage.setItem('token', fakeJwt({ sub: 'u1' }));
    expect(service.isSystemAdmin()).toBe(false);

    localStorage.setItem('token', 'not-a-jwt');
    expect(service.isSystemAdmin()).toBe(false);

    localStorage.removeItem('token');
    expect(service.isSystemAdmin()).toBe(false);
  });

  it('treats a corrupt menu cache as no menus (fails closed)', () => {
    localStorage.setItem('userMenus', '{not json');

    expect(service.accessibleModules().size).toBe(0);
    expect(service.canAccessModule('GOLF')).toBe(false);
  });
});
