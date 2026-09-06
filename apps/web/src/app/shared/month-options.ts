import { ComboOption } from './combobox/combobox';

// Month options for the shared combobox - the app-wide replacement for
// <input type="month">, which Firefox does not implement (it degrades to a
// bare text box showing the raw "YYYY-MM"). Values keep the exact "YYYY-MM"
// strings the native input produced, so screen handlers and API payloads are
// unchanged; labels follow the date display standard (the DEVICE's regional
// format via Intl, no locale baked into the bundle).
// Newest first, generous range (6 years back / 2 ahead) so historic filters
// and forward-dated runs both resolve; type-to-filter makes the length cheap
// ("sep" or "2026" narrows instantly - the keyboard-only entry standard).
export function monthComboOptions(pastMonths = 72, futureMonths = 24): ComboOption[] {
  const fmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
  const now = new Date();
  const opts: ComboOption[] = [];
  for (let i = futureMonths; i >= -pastMonths; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    opts.push({ value, label: fmt.format(d) });
  }
  return opts;
}
