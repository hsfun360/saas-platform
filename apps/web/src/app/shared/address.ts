// Address formatting - the app-wide standard for rendering a full postal
// address block (mirror of apps/api/src/platform/addressFormat.js - keep the
// line rules in sync):
//
//     line1 / line2 / line3
//     "<postcode> <city> <state>"   (ONE line, blanks skipped)
//     country FULL NAME             (never the alpha-2 code)
//
// The API annotates address JSON with `country` (display name resolved from
// the Country reference table); the uppercased code is only a fallback for
// responses that predate the annotation.
export function addressLines(a: Record<string, string | null> | null | undefined): string[] {
  if (!a) return [];
  return [
    a['line1'], a['line2'], a['line3'],
    [a['postcode'], a['city'], a['state']].filter(Boolean).join(' '),
    a['country'] || (a['countryCode'] ? String(a['countryCode']).toUpperCase() : null),
  ].filter((x): x is string => !!x);
}
