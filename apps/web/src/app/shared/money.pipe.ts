import { Pipe, PipeTransform } from '@angular/core';

// Money DISPLAY: the app-wide convention is a plain two-decimal string with no
// thousands separator (what the API returns and what every golf/AR screen
// renders). One pipe so templates never reach for Angular's `| number`, which
// formats from the compile-time LOCALE_ID (en-US for everyone), nor
// `toLocaleString`, which groups digits differently per device.
//   {{ row.amount | money }}        -> "1234.50"
//   {{ null | money }}              -> ""
//   {{ row.amount | money:'—' }}    -> "—" when empty
@Pipe({ name: 'money', standalone: true })
export class MoneyPipe implements PipeTransform {
  transform(value: number | string | null | undefined, empty = ''): string {
    if (value === null || value === undefined || value === '') return empty;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n.toFixed(2) : String(value);
  }
}
