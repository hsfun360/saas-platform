import { Injectable, signal } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'appTheme';

// App theme (light / dark) with three user modes:
//  - 'system' (default) follows the OS `prefers-color-scheme`, live;
//  - 'light' / 'dark' force a theme regardless of the OS.
// The resolved theme is applied as `data-theme` on <html>; all colours flow from
// the semantic tokens in styles.css. A tiny inline script in index.html applies
// the same value before Angular boots to avoid a flash of the wrong theme.
@Injectable({ providedIn: 'root' })
export class ThemeService {
  // The user's choice.
  readonly mode = signal<ThemeMode>('system');
  // The theme actually in effect after resolving 'system' — for the UI to reflect.
  readonly resolved = signal<'light' | 'dark'>('light');

  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');

  // APP_INITIALIZER: restore the stored preference and keep the page in sync with
  // the OS while the user stays on 'system'.
  init(): void {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    // Default to 'light' for now: dark-mode coverage is still being rolled out,
    // so we don't want OS-dark users landing on a partial dark theme. Flip this
    // default to 'system' once every screen is themed.
    this.mode.set(stored ?? 'light');
    this.apply();
    this.media.addEventListener('change', () => {
      if (this.mode() === 'system') this.apply();
    });
  }

  setMode(mode: ThemeMode): void {
    this.mode.set(mode);
    localStorage.setItem(STORAGE_KEY, mode);
    this.apply();
  }

  private apply(): void {
    const mode = this.mode();
    const resolved: 'light' | 'dark' =
      mode === 'system' ? (this.media.matches ? 'dark' : 'light') : mode;
    this.resolved.set(resolved);
    document.documentElement.setAttribute('data-theme', resolved);
  }
}
