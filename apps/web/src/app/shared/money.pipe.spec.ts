import { MoneyPipe } from './money.pipe';

// Money DISPLAY is a plain two-decimal string with NO thousands separator - the
// app-wide convention (what the API returns), deliberately not locale-grouped.
describe('MoneyPipe', () => {
  const pipe = new MoneyPipe();

  it('renders two decimals from a number', () => {
    expect(pipe.transform(1234.5)).toBe('1234.50');
    expect(pipe.transform(0)).toBe('0.00');
    expect(pipe.transform(7)).toBe('7.00');
  });

  it('rounds to two decimals', () => {
    expect(pipe.transform(10.456)).toBe('10.46');
    expect(pipe.transform(10.454)).toBe('10.45');
  });

  it('never inserts a thousands separator (one app-wide format, not the device locale)', () => {
    expect(pipe.transform(1234567.891)).toBe('1234567.89');
    expect(pipe.transform(1234567.891)).not.toContain(',');
  });

  it('accepts the numeric strings the API returns', () => {
    expect(pipe.transform('1250.5')).toBe('1250.50');
    expect(pipe.transform('-12.3')).toBe('-12.30');
  });

  it('renders null, undefined and empty as an empty string by default', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
    expect(pipe.transform('')).toBe('');
  });

  it('renders the placeholder argument for empty values only', () => {
    expect(pipe.transform(null, '-')).toBe('-');
    expect(pipe.transform(0, '-')).toBe('0.00');
  });

  it('shows a non-numeric value as-is rather than NaN', () => {
    expect(pipe.transform('abc')).toBe('abc');
  });
});
