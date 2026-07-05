// Shared dialling-code list for the phone-input component. Malaysia first (the
// platform's default market); add entries as needed. `code` is the E.164 dialling
// prefix (kept unique so a stored number can be split back into (code, national) by
// longest-prefix match). `flag` is the emoji flag shown in the native select -
// renders on mobile/macOS; Windows shows the 2-letter code instead (OS limitation).
export interface CountryCode {
  code: string;   // dialling prefix, e.g. '+60'
  name: string;   // e.g. 'Malaysia'
  flag: string;   // emoji flag, e.g. '🇲🇾'
}

export const COUNTRY_CODES: CountryCode[] = [
  { code: '+60', name: 'Malaysia', flag: '🇲🇾' },
  { code: '+65', name: 'Singapore', flag: '🇸🇬' },
  { code: '+62', name: 'Indonesia', flag: '🇮🇩' },
  { code: '+66', name: 'Thailand', flag: '🇹🇭' },
  { code: '+63', name: 'Philippines', flag: '🇵🇭' },
  { code: '+84', name: 'Vietnam', flag: '🇻🇳' },
  { code: '+91', name: 'India', flag: '🇮🇳' },
  { code: '+86', name: 'China', flag: '🇨🇳' },
  { code: '+1', name: 'US/Canada', flag: '🇺🇸' },
  { code: '+44', name: 'UK', flag: '🇬🇧' },
  { code: '+61', name: 'Australia', flag: '🇦🇺' },
];
