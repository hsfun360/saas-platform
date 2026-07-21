import { Injectable, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { MenuItem } from '../models/auth.models';
import { I18nService } from './i18n.service';

// Resolves the current screen's header title/subtitle from the granted MENU
// record, so what the user clicked in the sidebar and what the screen says
// always agree - in the user's active language. The Menu is the single source
// of truth for what a screen is called: subscribers maintain per-language
// names/descriptions in Modules & Menus (the Translations block), and the
// sidebar already renders them; this service brings the screen headers along.
//
// Resolution chain (each level independently per language):
//   menu.names[lang] -> menu.name -> the screen's hardcoded fallback
//   menu.descriptions[lang] -> menu.description -> hardcoded fallback
// Screens that aren't menu-backed (hardcoded SaaS Administration set, the
// Items sample) simply keep their fallback - same permissive default as
// PermissionsService.
//
// Route -> menu matching mirrors PermissionsService/HelpService: exact match,
// then progressively drop trailing segments so `/x/:id` details inherit `/x`.
// Menus come from the login's localStorage cache, so (like the sidebar) a menu
// rename shows after the next login refresh.
@Injectable({ providedIn: 'root' })
export class ScreenTitleService {
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);

  private menus: MenuItem[] | null = null;
  private readonly byUrl = new Map<string, MenuItem | null>();

  // Current router URL as a signal, so title()/subtitle() and the tab-title
  // effect below react to navigation as well as to language switches.
  private readonly url = signal(this.router.url);

  constructor() {
    this.router.events.subscribe((e) => {
      if (e instanceof NavigationEnd) this.url.set(e.urlAfterRedirects);
    });
    // Keep the browser-tab title in step with the screen header: the menu's
    // translated name when the route is menu-backed, the app default otherwise.
    effect(() => {
      const lang = this.i18n.lang();
      const menu = this.menuFor(this.path());
      document.title = (menu && ((menu.names && menu.names[lang]) || menu.name)) || 'Login';
    });
  }

  private path(): string {
    return this.url().split('?')[0].split('#')[0];
  }

  private grantedMenus(): MenuItem[] {
    if (this.menus === null) {
      try {
        this.menus = JSON.parse(localStorage.getItem('userMenus') || '[]');
      } catch {
        this.menus = [];
      }
    }
    return this.menus!;
  }

  private menuFor(url: string): MenuItem | null {
    if (this.byUrl.has(url)) return this.byUrl.get(url)!;
    const menus = this.grantedMenus();
    let found: MenuItem | null = null;
    const segments = url.split('/').filter(Boolean);
    for (let take = segments.length; take >= 1 && !found; take--) {
      const candidate = '/' + segments.slice(0, take).join('/');
      found = menus.find((m) => m.route === candidate) ?? null;
    }
    this.byUrl.set(url, found);
    return found;
  }

  private currentMenu(): MenuItem | null {
    return this.menuFor(this.path());
  }

  // Reads i18n.lang() so template callers (the impure pipes) re-evaluate when
  // the user toggles the language - same mechanism as TranslatePipe.
  title(fallback: string): string {
    const lang = this.i18n.lang();
    const menu = this.currentMenu();
    if (!menu) return fallback;
    return (menu.names && menu.names[lang]) || menu.name || fallback;
  }

  subtitle(fallback: string): string {
    const lang = this.i18n.lang();
    const menu = this.currentMenu();
    if (!menu) return fallback;
    return (menu.descriptions && menu.descriptions[lang]) || menu.description || fallback;
  }
}
