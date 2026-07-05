// Standard timezone formatting for the whole app.
//
// The app-wide standard for showing a timezone's UTC offset is "(UTC +08:00)":
// the literal "UTC", a space, a sign, two-digit hours, a colon, two-digit minutes
// (e.g. "UTC +08:00", "UTC -04:00", "UTC +05:30", "UTC +00:00"). Use these helpers
// (or the `tzLabel` pipe) everywhere a timezone offset is shown - never hand-roll
// the offset string.

// The current (DST-aware) offset of an IANA zone as "UTC +08:00". Empty string if
// the zone can't be resolved.
export function timezoneOffset(tz: string): string {
  if (!tz) return '';
  try {
    // 'longOffset' yields the "GMT+08:00" / "GMT-04:00" shape (with minutes),
    // or bare "GMT" for a zero offset.
    const raw =
      new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
        .formatToParts(new Date())
        .find((p) => p.type === 'timeZoneName')?.value ?? '';
    const off = raw.replace('GMT', '').trim(); // "+08:00" / "-04:00" / "" (== +00:00)
    return `UTC ${off || '+00:00'}`;
  } catch {
    return '';
  }
}

// A full display label: the IANA zone followed by its standard offset, e.g.
// "Asia/Kuala_Lumpur (UTC +08:00)". Falls back to just the zone if the offset
// can't be computed.
export function timezoneWithOffset(tz: string): string {
  if (!tz) return '';
  const offset = timezoneOffset(tz);
  return offset ? `${tz} (${offset})` : tz;
}
