import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

// Dependency-free, signal-based runtime i18n.
//
// Dictionaries are flat JSON maps of key -> string, served from /i18n/<code>.json
// (the `public/` folder). English ('en') is the base/fallback: any key missing
// from the active language falls back to English, then to the key itself, so the
// UI never shows blanks while translations are still being filled in.
//
// `translate()` reads the `lang` signal, so any consumer that calls it inside a
// template (via the `t` pipe) becomes reactive: switching language re-renders the
// view with no zone and no manual change detection.
const STORAGE_KEY = 'appLanguage';
export const DEFAULT_LANG = 'en';

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly http = inject(HttpClient);

  // The active language code (e.g. 'en', 'ms'). Public + reactive.
  readonly lang = signal<string>(DEFAULT_LANG);

  private readonly dict = signal<Record<string, string>>({});

  // The subscriber's default language, used as the FALLBACK for keys missing from
  // the active language (so a subscriber who offers Malay + Chinese but not English
  // falls back to their own default, not to the English base). Empty when the
  // default is English or unset - the English base already covers that case.
  readonly fallbackLang = signal<string>('');
  private readonly fallbackDict = signal<Record<string, string>>({});

  private base: Record<string, string> = {}; // English base - the source of truth, always complete
  private readonly cache = new Map<string, Record<string, string>>();

  // Load the English base then the stored language. Called once at app startup
  // (provideAppInitializer) so the first paint is already translated.
  async init(): Promise<void> {
    this.base = await this.load(DEFAULT_LANG);
    const stored = localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
    await this.use(stored);
  }

  // Switch the active language (loads + caches its dictionary, persists the choice).
  async use(code: string): Promise<void> {
    const lang = (code || DEFAULT_LANG).toLowerCase();
    const dict = lang === DEFAULT_LANG ? this.base : await this.load(lang);
    this.dict.set(dict);
    this.lang.set(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
  }

  // Set the subscriber's default language as the intermediate fallback. Called
  // after login / on the shell once the account's default is known. English or an
  // empty value clears it (the English base is the final fallback regardless).
  async setFallback(code: string | null): Promise<void> {
    const lang = (code || '').toLowerCase();
    if (!lang || lang === DEFAULT_LANG) {
      this.fallbackLang.set('');
      this.fallbackDict.set({});
      return;
    }
    const dict = await this.load(lang);
    this.fallbackDict.set(dict);
    this.fallbackLang.set(lang);
  }

  private async load(code: string): Promise<Record<string, string>> {
    if (this.cache.has(code)) return this.cache.get(code)!;
    try {
      const dict = (await firstValueFrom(this.http.get<Record<string, string>>(`/i18n/${code}.json`))) || {};
      this.cache.set(code, dict);
      return dict;
    } catch {
      this.cache.set(code, {}); // no dictionary yet -> fall back to English/key
      return {};
    }
  }

  // Look up a key. Fallback chain: active language -> the subscriber's default
  // language -> the English base -> the key itself. Supports {{param}}
  // interpolation. Reads the `lang` signal so template callers re-evaluate when
  // the language changes.
  translate(key: string, params?: Record<string, string | number>): string {
    this.lang(); // establish reactive dependency on the active language
    const template = this.dict()[key] ?? this.fallbackDict()[key] ?? this.base[key] ?? key;
    if (!params) return template;
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) =>
      params[k] !== undefined ? String(params[k]) : `{{${k}}}`,
    );
  }
}
