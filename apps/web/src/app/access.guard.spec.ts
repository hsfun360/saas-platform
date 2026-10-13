import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';

import { systemAccessGuard } from './access.guard';
import { MenuItem } from './models/auth.models';

// The guard answers two UX-layer questions per route: is the user entitled to
// the module (route data.moduleCode) and do they HOLD the screen's menu grant.
// Either failure redirects to /access-denied.
describe('systemAccessGuard', () => {
  let router: Router;

  function run(moduleCode: string | undefined, url: string): boolean | UrlTree {
    const route = { data: moduleCode ? { moduleCode } : {} } as unknown as ActivatedRouteSnapshot;
    const state = { url } as RouterStateSnapshot;
    return TestBed.runInInjectionContext(() => systemAccessGuard(route, state)) as boolean | UrlTree;
  }

  function expectDenied(result: boolean | UrlTree): void {
    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/access-denied');
  }

  function storeMenus(menus: Partial<MenuItem>[]): void {
    localStorage.setItem('userMenus', JSON.stringify(menus));
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    router = TestBed.inject(Router);
  });

  afterEach(() => localStorage.clear());

  it('allows a route whose module AND menu are granted', () => {
    storeMenus([{ name: 'Courses', route: '/golf/courses', moduleCode: 'GOLF' }]);

    expect(run('GOLF', '/golf/courses')).toBe(true);
  });

  it('lets a detail route inherit its listing menu grant', () => {
    storeMenus([{ name: 'Courses', route: '/golf/courses', moduleCode: 'GOLF' }]);

    expect(run('GOLF', '/golf/courses/abc-123?tab=holes')).toBe(true);
  });

  it('redirects to /access-denied when the user lacks the module entirely', () => {
    storeMenus([{ name: 'Memberships', route: '/membership/memberships', moduleCode: 'MEMBERSHIP' }]);

    expectDenied(run('GOLF', '/golf/courses'));
  });

  it('redirects to /access-denied when the module is granted but the screen itself is not a held menu (deep link)', () => {
    storeMenus([{ name: 'Bookings', route: '/golf/bookings', moduleCode: 'GOLF' }]);

    expectDenied(run('GOLF', '/golf/courses'));
  });

  it('redirects when nothing is granted at all', () => {
    expectDenied(run('GOLF', '/golf/courses'));
  });

  it('skips the module check for a route without moduleCode but still requires the menu', () => {
    storeMenus([{ name: 'Courses', route: '/golf/courses', moduleCode: 'GOLF' }]);

    expect(run(undefined, '/golf/courses')).toBe(true);
    expectDenied(run(undefined, '/somewhere/else'));
  });

  it('a Tenant Admin passes both checks implicitly', () => {
    localStorage.setItem('userRole', 'Tenant Admin');

    expect(run('TENANT_ADMIN', '/admin/roles')).toBe(true);
    expectDenied(run('PLATFORM_ADMIN', '/admin/subscribers'));
  });
});
