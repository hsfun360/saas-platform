import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PermissionsService } from './permissions.service';
import { MenuItem } from '../models/auth.models';

// PermissionsService backs the `*appCan` directive: per-menu create / edit /
// delete flags resolved from the login's menu cache. `can()` is permissive by
// default (gating engages only when a grant explicitly withholds an action),
// `canOnMenu()` and `hasMenu()` are strict (the menu must be held).
describe('PermissionsService', () => {
  let service: PermissionsService;

  function storeMenus(menus: Partial<MenuItem>[]): void {
    localStorage.setItem('userMenus', JSON.stringify(menus));
  }

  const TYPES = '/membership/types';

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    service = TestBed.inject(PermissionsService);
  });

  afterEach(() => localStorage.clear());

  describe('can (the *appCan source)', () => {
    it('reports each flag of the menu matching the route', () => {
      storeMenus([{ name: 'Types', route: TYPES, actions: { create: true, edit: false, delete: false } }]);

      expect(service.can('create', TYPES)).toBe(true);
      expect(service.can('edit', TYPES)).toBe(false);
      expect(service.can('delete', TYPES)).toBe(false);
    });

    it('lets a detail route inherit the listing menu flags and ignores query/hash', () => {
      storeMenus([{ name: 'Types', route: TYPES, actions: { create: false, edit: true, delete: false } }]);

      expect(service.can('edit', `${TYPES}/abc-1`)).toBe(true);
      expect(service.can('create', `${TYPES}/abc-1?mode=new#top`)).toBe(false);
    });

    it('prefers the most specific (longest) matching route', () => {
      storeMenus([
        { name: 'Types', route: TYPES, actions: { create: true, edit: true, delete: true } },
        { name: 'Fees', route: `${TYPES}/fees`, actions: { create: false, edit: false, delete: false } },
      ]);

      expect(service.can('create', `${TYPES}/fees/x`)).toBe(false);
      expect(service.can('create', `${TYPES}/other`)).toBe(true);
    });

    it('treats a menu cached before the action flags shipped as full access', () => {
      storeMenus([{ name: 'Types', route: TYPES }]);

      expect(service.can('create', TYPES)).toBe(true);
      expect(service.can('delete', TYPES)).toBe(true);
    });

    it('is permissive for a screen that is not in the menu catalogue and for an empty cache', () => {
      storeMenus([{ name: 'Types', route: TYPES, actions: { create: false, edit: false, delete: false } }]);
      expect(service.can('create', '/golf/courses')).toBe(true);

      localStorage.removeItem('userMenus');
      expect(service.can('delete', TYPES)).toBe(true);
    });

    it('a Tenant Admin may do everything regardless of the flags', () => {
      localStorage.setItem('userRole', 'Tenant Admin');
      storeMenus([{ name: 'Types', route: TYPES, actions: { create: false, edit: false, delete: false } }]);

      expect(service.can('create', TYPES)).toBe(true);
      expect(service.can('delete', TYPES)).toBe(true);
    });
  });

  describe('canOnMenu (cross-screen, strict)', () => {
    it('denies when the target menu is not held, even though can() would be permissive', () => {
      storeMenus([{ name: 'Types', route: TYPES, actions: { create: true, edit: true, delete: true } }]);

      expect(service.canOnMenu('create', '/ar/invoices')).toBe(false);
      expect(service.can('create', '/ar/invoices')).toBe(true);
    });

    it('respects the flag on a held menu and treats a flag-less grant as full access', () => {
      storeMenus([
        { name: 'Invoices', route: '/ar/invoices', actions: { create: true, edit: false, delete: false } },
        { name: 'Receipts', route: '/ar/receipts' },
      ]);

      expect(service.canOnMenu('create', '/ar/invoices')).toBe(true);
      expect(service.canOnMenu('edit', '/ar/invoices')).toBe(false);
      expect(service.canOnMenu('delete', '/ar/receipts')).toBe(true);
    });

    it('matches the exact route only (no segment dropping)', () => {
      storeMenus([{ name: 'Invoices', route: '/ar/invoices', actions: { create: true, edit: true, delete: true } }]);

      expect(service.canOnMenu('create', '/ar/invoices/123')).toBe(false);
    });
  });

  describe('hasMenu (route guard check, strict)', () => {
    it('holds a route exactly or via its listing prefix, strips query and hash', () => {
      storeMenus([{ name: 'Types', route: TYPES }]);

      expect(service.hasMenu(TYPES)).toBe(true);
      expect(service.hasMenu(`${TYPES}/abc?x=1#h`)).toBe(true);
      expect(service.hasMenu('/membership')).toBe(false);
      expect(service.hasMenu('/golf/courses')).toBe(false);
    });

    it('admins hold every menu implicitly', () => {
      localStorage.setItem('userRole', 'Tenant Admin');

      expect(service.hasMenu('/anything/at/all')).toBe(true);
    });
  });
});
