import { Country } from '../models/auth.models';

// Country reference helpers.
//
// Country NAMES now come from the DB `Country` table (synced from world_countries)
// via CountryService - there is no hardcoded name list here anymore.
//
// Timezones are NOT in that dataset, so they stay curated here, keyed by ISO
// alpha-2 (lowercase) - stable across the dataset's long/short name variations
// (e.g. "United States of America", "Korea, Republic of"). Single-entry countries
// auto-fill the timezone; multi-entry countries offer the list as a shortlist.
// Countries not listed here leave the timezone free-text.
export const COUNTRY_TIMEZONES: Record<string, string[]> = {
  my: ['Asia/Kuala_Lumpur'],
  sg: ['Asia/Singapore'],
  id: ['Asia/Jakarta', 'Asia/Pontianak', 'Asia/Makassar', 'Asia/Jayapura'],
  th: ['Asia/Bangkok'],
  ph: ['Asia/Manila'],
  vn: ['Asia/Ho_Chi_Minh'],
  bn: ['Asia/Brunei'],
  kh: ['Asia/Phnom_Penh'],
  mm: ['Asia/Yangon'],
  la: ['Asia/Vientiane'],
  in: ['Asia/Kolkata'],
  cn: ['Asia/Shanghai', 'Asia/Urumqi'],
  jp: ['Asia/Tokyo'],
  kr: ['Asia/Seoul'],
  hk: ['Asia/Hong_Kong'],
  tw: ['Asia/Taipei'],
  au: [
    'Australia/Sydney',
    'Australia/Melbourne',
    'Australia/Brisbane',
    'Australia/Adelaide',
    'Australia/Perth',
    'Australia/Hobart',
    'Australia/Darwin',
  ],
  nz: ['Pacific/Auckland', 'Pacific/Chatham'],
  gb: ['Europe/London'],
  us: [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Phoenix',
    'America/Los_Angeles',
    'America/Anchorage',
    'Pacific/Honolulu',
  ],
  ca: [
    'America/Toronto',
    'America/Winnipeg',
    'America/Regina',
    'America/Edmonton',
    'America/Vancouver',
    'America/Halifax',
    'America/St_Johns',
  ],
  ae: ['Asia/Dubai'],
  sa: ['Asia/Riyadh'],
};

// Bundled fallback country list for the country combobox + timezone linkage, used
// until the DB `Country` table is synced (GET /api/countries returns []). Covers
// the countries we have timezones for; once synced, the full DB list replaces it.
export const FALLBACK_COUNTRIES: Country[] = [
  { alpha2: 'my', name: 'Malaysia', flagEmoji: '🇲🇾' },
  { alpha2: 'sg', name: 'Singapore', flagEmoji: '🇸🇬' },
  { alpha2: 'id', name: 'Indonesia', flagEmoji: '🇮🇩' },
  { alpha2: 'th', name: 'Thailand', flagEmoji: '🇹🇭' },
  { alpha2: 'ph', name: 'Philippines', flagEmoji: '🇵🇭' },
  { alpha2: 'vn', name: 'Vietnam', flagEmoji: '🇻🇳' },
  { alpha2: 'bn', name: 'Brunei', flagEmoji: '🇧🇳' },
  { alpha2: 'kh', name: 'Cambodia', flagEmoji: '🇰🇭' },
  { alpha2: 'mm', name: 'Myanmar', flagEmoji: '🇲🇲' },
  { alpha2: 'la', name: 'Laos', flagEmoji: '🇱🇦' },
  { alpha2: 'in', name: 'India', flagEmoji: '🇮🇳' },
  { alpha2: 'cn', name: 'China', flagEmoji: '🇨🇳' },
  { alpha2: 'jp', name: 'Japan', flagEmoji: '🇯🇵' },
  { alpha2: 'kr', name: 'South Korea', flagEmoji: '🇰🇷' },
  { alpha2: 'hk', name: 'Hong Kong', flagEmoji: '🇭🇰' },
  { alpha2: 'tw', name: 'Taiwan', flagEmoji: '🇹🇼' },
  { alpha2: 'au', name: 'Australia', flagEmoji: '🇦🇺' },
  { alpha2: 'nz', name: 'New Zealand', flagEmoji: '🇳🇿' },
  { alpha2: 'gb', name: 'United Kingdom', flagEmoji: '🇬🇧' },
  { alpha2: 'us', name: 'United States', flagEmoji: '🇺🇸' },
  { alpha2: 'ca', name: 'Canada', flagEmoji: '🇨🇦' },
  { alpha2: 'ae', name: 'United Arab Emirates', flagEmoji: '🇦🇪' },
  { alpha2: 'sa', name: 'Saudi Arabia', flagEmoji: '🇸🇦' },
  // "Others" - a valid list-picked choice for a country outside the reference set.
  // Kept in sync with the backend's country-constants.js ('zz'); no timezone.
  { alpha2: 'zz', name: 'Others' },
];
