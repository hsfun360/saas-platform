import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { DEFAULT_LANG, I18nService } from './i18n.service';

// Dictionaries are flat JSON maps served from /i18n/<code>.json. English is the
// base; lookups fall back active -> subscriber default -> English -> the key.
describe('I18nService', () => {
  let service: I18nService;
  let http: HttpTestingController;

  const EN = { hello: 'Hello', bye: 'Goodbye', greet: 'Hi {{ name }}, you have {{count}} tasks' };

  // Resolve one pending dictionary request, letting the awaiting caller continue.
  async function flushDict(code: string, dict: Record<string, string> | null): Promise<void> {
    await Promise.resolve();
    const req = http.expectOne(`/i18n/${code}.json`);
    expect(req.request.method).toBe('GET');
    if (dict) req.flush(dict);
    else req.flush('not found', { status: 404, statusText: 'Not Found' });
    await Promise.resolve();
  }

  async function initWith(stored?: string): Promise<void> {
    if (stored) localStorage.setItem('appLanguage', stored);
    const p = service.init();
    await flushDict('en', EN);
    if (stored && stored !== DEFAULT_LANG) await flushDict(stored, { hello: 'Helo' });
    await p;
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(I18nService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('starts on English and returns the key itself before any dictionary is loaded', () => {
    expect(service.lang()).toBe('en');
    expect(service.translate('hello')).toBe('hello');
  });

  it('init loads the English base and applies it', async () => {
    await initWith();

    expect(service.lang()).toBe('en');
    expect(service.translate('hello')).toBe('Hello');
    expect(service.translate('missing.key')).toBe('missing.key');
  });

  it('init resumes the stored language after loading the base', async () => {
    await initWith('ms');

    expect(service.lang()).toBe('ms');
    expect(service.translate('hello')).toBe('Helo');
  });

  it('use() switches the lang signal, persists the choice and stamps <html lang>', async () => {
    await initWith();

    const p = service.use('MS');
    await flushDict('ms', { hello: 'Helo' });
    await p;

    expect(service.lang()).toBe('ms');
    expect(localStorage.getItem('appLanguage')).toBe('ms');
    expect(document.documentElement.lang).toBe('ms');
    expect(service.translate('hello')).toBe('Helo');
  });

  it('a key missing from the active language falls back to the English base, then to the key', async () => {
    await initWith();
    const p = service.use('ms');
    await flushDict('ms', { hello: 'Helo' });
    await p;

    expect(service.translate('bye')).toBe('Goodbye');
    expect(service.translate('nope')).toBe('nope');
  });

  it('caches a dictionary so switching back does not refetch, and switching to English needs no request', async () => {
    await initWith();
    let p = service.use('ms');
    await flushDict('ms', { hello: 'Helo' });
    await p;

    p = service.use('en');
    await p;
    expect(service.lang()).toBe('en');
    expect(service.translate('hello')).toBe('Hello');

    p = service.use('ms');
    await Promise.resolve();
    http.expectNone('/i18n/ms.json');
    await p;
    expect(service.translate('hello')).toBe('Helo');
  });

  it('a language with no dictionary yet (404) is still usable and falls back to English', async () => {
    await initWith();

    const p = service.use('zh');
    await flushDict('zh', null);
    await p;

    expect(service.lang()).toBe('zh');
    expect(service.translate('hello')).toBe('Hello');
  });

  it('the subscriber default language sits between the active language and English in the fallback chain', async () => {
    await initWith();
    let p = service.use('ms');
    await flushDict('ms', { hello: 'Helo' });
    await p;

    p = service.setFallback('zh');
    await flushDict('zh', { bye: 'Zai jian', hello: 'Ni hao' });
    await p;

    expect(service.fallbackLang()).toBe('zh');
    expect(service.translate('hello')).toBe('Helo'); // active wins
    expect(service.translate('bye')).toBe('Zai jian'); // subscriber default before English
    expect(service.translate('greet')).toContain('Hi'); // English base last

    await service.setFallback('en');
    expect(service.fallbackLang()).toBe('');
    expect(service.translate('bye')).toBe('Goodbye');
  });

  it('interpolates {{param}} placeholders and leaves unknown ones visible', async () => {
    await initWith();

    expect(service.translate('greet', { name: 'Ana', count: 3 })).toBe('Hi Ana, you have 3 tasks');
    expect(service.translate('greet', { name: 'Ana' })).toBe('Hi Ana, you have {{count}} tasks');
    expect(service.translate('greet')).toBe(EN.greet);
  });
});
