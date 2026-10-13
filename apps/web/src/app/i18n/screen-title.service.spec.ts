import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { ScreenTitleService } from './screen-title.service';
import { I18nService } from './i18n.service';
import { MenuItem } from '../models/auth.models';

@Component({ standalone: true, template: '' })
class BlankComponent {}

// The screen header and the browser tab both resolve from the granted Menu
// record for the current route (exact, then dropping trailing segments), in
// the active language; non-menu routes keep the screen's fallback and the
// product name in the tab.
describe('ScreenTitleService', () => {
  const lang = signal('en');
  let service: ScreenTitleService;
  let router: Router;

  const MENUS: Partial<MenuItem>[] = [
    {
      name: 'Membership Types',
      names: { ms: 'Jenis Keahlian' },
      description: 'Catalog of membership types.',
      descriptions: { ms: 'Katalog jenis keahlian.' },
      route: '/membership/types',
      moduleCode: 'MEMBERSHIP',
    },
    { name: 'Courses', route: '/golf/courses', moduleCode: 'GOLF' },
  ];

  async function go(url: string): Promise<void> {
    await router.navigateByUrl(url);
    TestBed.tick();
  }

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('userMenus', JSON.stringify(MENUS));
    lang.set('en');
    document.title = '';
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', component: BlankComponent }]),
        { provide: I18nService, useValue: { lang } },
      ],
    });
    router = TestBed.inject(Router);
    service = TestBed.inject(ScreenTitleService);
    TestBed.tick();
  });

  afterEach(() => localStorage.clear());

  it('falls back to the screen text and the product name when the route is not menu-backed', async () => {
    await go('/profile');

    expect(service.title('My Profile')).toBe('My Profile');
    expect(service.subtitle('Your details')).toBe('Your details');
    expect(document.title).toBe('myEasySoft');
  });

  it('uses the granted menu name and description for a menu-backed route', async () => {
    await go('/membership/types');

    expect(service.title('Types (fallback)')).toBe('Membership Types');
    expect(service.subtitle('fallback')).toBe('Catalog of membership types.');
    expect(document.title).toBe('Membership Types');
  });

  it('a detail route inherits the listing menu, ignoring query and hash', async () => {
    await go('/membership/types/abc-123?tab=fees#top');

    expect(service.title('fallback')).toBe('Membership Types');
    expect(document.title).toBe('Membership Types');
  });

  it('renders the per-language name when the menu carries one, and the base name otherwise', async () => {
    await go('/membership/types');
    lang.set('ms');
    TestBed.tick();

    expect(service.title('fallback')).toBe('Jenis Keahlian');
    expect(service.subtitle('fallback')).toBe('Katalog jenis keahlian.');
    expect(document.title).toBe('Jenis Keahlian');

    await go('/golf/courses');
    expect(service.title('fallback')).toBe('Courses'); // no Malay name -> base name
    expect(service.subtitle('Tee sheets')).toBe('Tee sheets'); // no description at all -> fallback
    expect(document.title).toBe('Courses');
  });

  it('keeps the tab title in step with navigation', async () => {
    await go('/membership/types');
    expect(document.title).toBe('Membership Types');

    await go('/golf/courses');
    expect(document.title).toBe('Courses');

    await go('/settings');
    expect(document.title).toBe('myEasySoft');
  });
});
