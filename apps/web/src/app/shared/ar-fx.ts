// Multicurrency helpers shared by the AR entry dialogs (step 3, 2026-08-21).
// A document is in its ACCOUNT's currency; the dialogs only ever ask for the
// RATE to base on foreign-currency accounts, defaulting it from the account
// currency's rate history at the document date (the API re-resolves when
// nothing is keyed, and freezes the rate on the row).

import { ArAccountCurrency } from '../models/ar.models';

// Positive decimal, at most 10 places - the ar.ExchangeRate precision.
export const AR_RATE_PATTERN = /^\d+(\.\d{1,10})?$/;

// The rate effective on `docDate`: latest effectiveDate <= docDate, or '' when
// the table has none yet (the field stays blank for the user to key).
export function arRateForDate(currency: ArAccountCurrency | null | undefined, docDate: string): string {
  if (!currency || currency.isBase || !docDate) return '';
  let best: { effectiveDate: string; rate: string } | null = null;
  for (const r of currency.rates || []) {
    if (r.effectiveDate <= docDate && (!best || r.effectiveDate > best.effectiveDate)) best = r;
  }
  return best ? arTrimRate(best.rate) : '';
}

// "4.7100000000" -> "4.71" for editing / reading.
export function arTrimRate(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const s = String(value);
  if (!/^\d+\.\d+$/.test(s)) return s;
  const t = s.replace(/0+$/, '');
  return t.endsWith('.') ? t.slice(0, -1) : t;
}

// Base-currency equivalent readout for an amount at a rate (2dp), '' when
// either side is missing.
export function arBaseEquivalent(amount: number | string | null | undefined, rate: string | number | null | undefined): string {
  const a = Number(amount);
  const r = Number(rate);
  if (!Number.isFinite(a) || !Number.isFinite(r) || a <= 0 || r <= 0) return '';
  return (Math.round(a * r * 100) / 100).toFixed(2);
}
