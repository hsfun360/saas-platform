import { monthComboOptions } from './month-options';

// Month pickers are comboboxes (never <input type="month">): values keep the
// exact "YYYY-MM" strings, labels follow the device locale, newest first.
describe('monthComboOptions', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 9, 15) }); // 15 Oct 2026, local time
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('spans 6 years back and 2 years ahead of the current month by default, newest first', () => {
    const opts = monthComboOptions();

    expect(opts.length).toBe(72 + 24 + 1);
    expect(opts[0].value).toBe('2028-10');
    expect(opts[24].value).toBe('2026-10');
    expect(opts[opts.length - 1].value).toBe('2020-10');
  });

  it('keeps every value as a zero-padded YYYY-MM string in strictly descending order', () => {
    const opts = monthComboOptions();

    for (const o of opts) expect(o.value).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    for (let i = 1; i < opts.length; i++) expect(opts[i].value < opts[i - 1].value).toBe(true);
  });

  it('rolls across year boundaries correctly', () => {
    const opts = monthComboOptions(3, 3);

    expect(opts.map((o) => o.value)).toEqual([
      '2027-01', '2026-12', '2026-11', '2026-10', '2026-09', '2026-08', '2026-07',
    ]);
  });

  it('labels each month in the device regional long-month format', () => {
    const fmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
    const opts = monthComboOptions(0, 0);

    expect(opts).toEqual([{ value: '2026-10', label: fmt.format(new Date(2026, 9, 1)) }]);
  });
});
