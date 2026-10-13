import { addressLines } from './address';

// The app-wide postal block: line1 / line2 / line3, then "<postcode> <city>
// <state>" on ONE line with blanks skipped, then the country's FULL name.
describe('addressLines', () => {
  it('renders the full block with postcode, city and state on one line and the country name last', () => {
    expect(
      addressLines({
        line1: '12 Jalan Bukit',
        line2: 'Taman Indah',
        line3: null,
        postcode: '47800',
        city: 'Petaling Jaya',
        state: 'Selangor',
        country: 'Malaysia',
        countryCode: 'MY',
      }),
    ).toEqual(['12 Jalan Bukit', 'Taman Indah', '47800 Petaling Jaya Selangor', 'Malaysia']);
  });

  it('skips blank parts of the postcode line without leaving stray spaces', () => {
    expect(addressLines({ line1: 'A', postcode: '', city: 'Ipoh', state: null, country: 'Malaysia' })).toEqual([
      'A',
      'Ipoh',
      'Malaysia',
    ]);
  });

  it('drops the postcode line entirely when all three parts are empty', () => {
    expect(addressLines({ line1: 'A', country: 'Singapore' })).toEqual(['A', 'Singapore']);
  });

  it('falls back to the UPPERCASED alpha-2 code only when no country name was annotated', () => {
    expect(addressLines({ line1: 'A', countryCode: 'my' })).toEqual(['A', 'MY']);
    expect(addressLines({ line1: 'A', country: 'Malaysia', countryCode: 'my' })).toEqual(['A', 'Malaysia']);
  });

  it('returns no lines for a missing or empty address', () => {
    expect(addressLines(null)).toEqual([]);
    expect(addressLines(undefined)).toEqual([]);
    expect(addressLines({})).toEqual([]);
    expect(addressLines({ line1: '', city: '', country: null })).toEqual([]);
  });
});
