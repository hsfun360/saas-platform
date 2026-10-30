// Apply the saved theme before first paint (ThemeService re-applies on boot).
// Mirrors the resolve logic: 'system' follows the OS, else the stored choice.
// Lives in its own file (not inline in index.html) so the Content-Security-Policy
// can stay script-src 'self' with no inline-script hash to maintain.
(function () {
  try {
    var m = localStorage.getItem('appTheme') || 'light';
    var dark = m === 'dark' || (m === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch (e) {}
})();
