import { LocalDatePipe, formatLocalDate, localDateOnly, monthYearLabel } from './local-date.pipe';

// The pipe formats in the DEVICE's regional format, so the expected strings are
// built with the same Intl options rather than hard-coded English - what the
// tests pin is the parsing (date-only strings are LOCAL dates), the style
// selection and the empty / unparseable handling.
describe('LocalDatePipe', () => {
  const pipe = new LocalDatePipe();

  function expected(d: Date, opts: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(undefined, opts).format(d);
  }

  function dayPart(d: Date, opts: Intl.DateTimeFormatOptions): string | undefined {
    return new Intl.DateTimeFormat(undefined, opts).formatToParts(d).find((p) => p.type === 'day')?.value;
  }

  it('renders an ISO date-only string as a LOCAL calendar date (no UTC off-by-one)', () => {
    const out = pipe.transform('2026-12-31');

    expect(out).toBe(expected(new Date(2026, 11, 31), { dateStyle: 'medium' }));
    // The day the user typed is the day they see, whatever the device timezone.
    const parts = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).formatToParts(new Date(2026, 11, 31));
    expect(parts.find((p) => p.type === 'day')?.value).toBe('31');
    expect(out).toContain('31');
  });

  it('returns an empty string for null, undefined and empty input', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
    expect(pipe.transform('')).toBe('');
  });

  it('shows an unparseable value as-is rather than "Invalid Date"', () => {
    expect(pipe.transform('not-a-date')).toBe('not-a-date');
  });

  it('accepts Date objects and epoch millis', () => {
    const d = new Date(2026, 6, 21, 14, 5);

    expect(pipe.transform(d)).toBe(expected(d, { dateStyle: 'medium' }));
    expect(pipe.transform(d.getTime())).toBe(expected(d, { dateStyle: 'medium' }));
  });

  it('the datetime style appends the device-format time', () => {
    const d = new Date(2026, 6, 21, 14, 5);

    expect(pipe.transform(d, 'datetime')).toBe(expected(d, { dateStyle: 'medium', timeStyle: 'short' }));
    expect(pipe.transform(d, 'datetime')).not.toBe(pipe.transform(d));
  });

  it('the weekday style carries the short day name', () => {
    const d = new Date(2026, 6, 21); // a Tuesday

    expect(pipe.transform(d, 'weekday')).toBe(
      expected(d, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
    );
  });

  it('dayMonth and monthYear styles drop the year and the day respectively', () => {
    const d = new Date(2026, 10, 14);

    expect(formatLocalDate(d, 'dayMonth')).toBe(expected(d, { day: 'numeric', month: 'short' }));
    expect(formatLocalDate(d, 'monthYear')).toBe(expected(d, { month: 'short', year: 'numeric' }));
    expect(dayPart(d, { month: 'short', year: 'numeric' })).toBeUndefined();
  });

  it('monthYearLabel turns a YYYY-MM key into the device month label and passes junk through', () => {
    expect(monthYearLabel('2026-11')).toBe(expected(new Date(2026, 10, 1), { month: 'short', year: 'numeric' }));
    expect(monthYearLabel('2026-11-30')).toBe(monthYearLabel('2026-11'));
    expect(monthYearLabel('all')).toBe('all');
  });

  it('localDateOnly gives the LOCAL calendar date as YYYY-MM-DD with zero padding', () => {
    expect(localDateOnly(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(localDateOnly(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });
});
