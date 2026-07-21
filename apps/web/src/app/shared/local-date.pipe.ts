import { Pipe, PipeTransform } from '@angular/core';

// Formats a date for display in the DEVICE's regional format - the app-wide
// standard for showing dates (see docs/coding-standards.md). Passing
// `undefined` as the Intl locale means "the browser/OS regional setting", so a
// UK/MY device sees "21 Jul 2026", a US device "Jul 21, 2026", a DE device
// "21.07.2026" - and `timeStyle` follows the device's 12/24-hour clock. Zero
// locale data ships in the bundle (unlike Angular's `| date`, which formats
// from the compile-time LOCALE_ID and shows en-US to everyone).
//
// Styles:
//   'date'     (default) - medium date, e.g. "21 Jul 2026"
//   'datetime' - medium date + short time, e.g. "21 Jul 2026, 14:05"
//   'weekday'  - short weekday + medium date, e.g. "Tue, 21 Jul 2026"
//
// Input may be a Date, epoch millis, an ISO datetime string, or a date-only
// `YYYY-MM-DD` string. Date-only strings are parsed as LOCAL dates on purpose:
// `new Date('2026-12-31')` is UTC midnight, which renders as Dec 30 on a
// device west of Greenwich - the classic off-by-one-day trap.
type LocalDateStyle = 'date' | 'datetime' | 'weekday';

const STYLES: Record<LocalDateStyle, Intl.DateTimeFormatOptions> = {
  date: { dateStyle: 'medium' },
  datetime: { dateStyle: 'medium', timeStyle: 'short' },
  weekday: { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' },
};

// Intl.DateTimeFormat construction is expensive; cache one per style.
const formatters = new Map<LocalDateStyle, Intl.DateTimeFormat>();

function formatterFor(style: LocalDateStyle): Intl.DateTimeFormat {
  let f = formatters.get(style);
  if (!f) {
    f = new Intl.DateTimeFormat(undefined, STYLES[style]);
    formatters.set(style, f);
  }
  return f;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

@Pipe({ name: 'localDate', standalone: true })
export class LocalDatePipe implements PipeTransform {
  transform(value: string | number | Date | null | undefined, style: LocalDateStyle = 'date'): string {
    if (value === null || value === undefined || value === '') return '';
    let d: Date;
    if (value instanceof Date) {
      d = value;
    } else if (typeof value === 'string') {
      const m = DATE_ONLY.exec(value);
      d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(value);
    } else {
      d = new Date(value);
    }
    if (isNaN(d.getTime())) return String(value); // unparseable -> show as-is
    return formatterFor(style).format(d);
  }
}
