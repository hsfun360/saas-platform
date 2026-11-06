// Global unit-test environment shims - vitest runs specs in jsdom, which lacks
// a few browser APIs the app touches at service construction time.
// Wired via angular.json -> projects.Login.architect.test.options.setupFiles.

// ThemeService reads prefers-color-scheme via matchMedia when it is built.
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  });
}

// ScrollReturnService builds an attribute selector with CSS.escape when a list
// returns to the row the user came from; jsdom has no CSS namespace at all, so
// without this the service threw (and logged) under test. A minimal escape:
// every character outside [A-Za-z0-9_-] is backslash-escaped, which is a
// superset of what the spec requires and enough for an id.
if (typeof globalThis.CSS === 'undefined') {
  Object.defineProperty(globalThis, 'CSS', { writable: true, value: {} });
}
if (typeof globalThis.CSS.escape !== 'function') {
  globalThis.CSS.escape = (value: string): string => String(value).replace(/[^A-Za-z0-9_-]/g, (c) => `\\${c}`);
}

export {};
