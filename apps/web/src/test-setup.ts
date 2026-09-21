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

export {};
