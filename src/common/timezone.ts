/**
 * BeautyHub's datetime convention:
 *
 * - Every instant on the wire (booking start/end, availability slots) is
 *   UTC ISO-8601; clients convert to the device's local zone for display.
 * - Wall-clock fields (`Salon.openHour`/`closeHour`, the `date=YYYY-MM-DD`
 *   query params) are in the salon market's timezone, NOT the server's.
 *   Production servers run in UTC; without this the salons would "open"
 *   two hours late.
 *
 * v1 launches in a single market, so the market timezone is one config value
 * (SALON_TIMEZONE, IANA name). Going multi-market later means moving this
 * onto the Salon row — every caller already goes through these helpers.
 */
const SALON_TIME_ZONE = process.env.SALON_TIMEZONE ?? 'Africa/Johannesburg';

const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: SALON_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** The zone's UTC offset in ms at the given instant (DST-aware). */
function zoneOffsetMs(at: Date): number {
  const p: Record<string, number> = {};
  for (const { type, value } of partsFormat.formatToParts(at)) {
    if (type !== 'literal') p[type] = Number(value);
  }
  const wallClockAsUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour === 24 ? 0 : p.hour, // Intl can render midnight as 24
    p.minute,
    p.second,
  );
  return wallClockAsUtc - at.getTime();
}

/** The UTC instant at which a wall-clock time in the salon market occurs,
 *  e.g. (2026, 7, 29, 9) → 2026-07-29T07:00:00Z for Africa/Johannesburg. */
export function salonWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // Correct the guess by the zone offset; a second pass settles instants
  // that fall right on a DST transition (a no-op for fixed-offset zones
  // like Africa/Johannesburg).
  const once = guess - zoneOffsetMs(new Date(guess));
  return new Date(guess - zoneOffsetMs(new Date(once)));
}
