/**
 * Converts a wall-clock time in a time zone ("2026-11-05", "12:00", "Africa/Lome") to the UTC
 * instant, with no dependency: Intl gives the zone's offset at that moment. Créneaux are written
 * in the community's local time; the database stores UTC.
 */
export const DEFAULT_PRAYER_TIMEZONE = process.env.PRAYER_TIMEZONE || 'Africa/Lome';

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{1,2}):(\d{2})$/;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Offset of `tz` from UTC at `instant`, in minutes (Paris in winter → 60). */
function offsetMinutes(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - instant.getTime()) / 60000);
}

export function zonedToUtc(date: string, time: string, tz: string = DEFAULT_PRAYER_TIMEZONE): Date {
  const d = DATE.exec(date);
  const t = TIME.exec(time);
  if (!d || !t) throw new Error(`Invalid date or time: ${date} ${time}`);
  const [h, m] = [Number(t[1]), Number(t[2])];
  if (h > 23 || m > 59) throw new Error(`Invalid time: ${time}`);
  const naive = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), h, m);
  // Two passes handle a date right at a daylight-saving change.
  let guess = naive - offsetMinutes(new Date(naive), tz) * 60000;
  guess = naive - offsetMinutes(new Date(guess), tz) * 60000;
  return new Date(guess);
}

/** "2026-11-05" + n days. */
export function addDays(date: string, days: number): string {
  const d = DATE.exec(date);
  if (!d) throw new Error(`Invalid date: ${date}`);
  const next = new Date(Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]) + days));
  return next.toISOString().slice(0, 10);
}

/** The local date ("2026-11-05") of an instant in `tz`. */
export function localDateOf(instant: Date, tz: string = DEFAULT_PRAYER_TIMEZONE): string {
  return new Date(instant.getTime() + offsetMinutes(instant, tz) * 60000).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` ("2026-11-05" → "2026-11-08" = 3). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** The local wall-clock time ("12:05") of an instant in `tz`. */
export function localTimeOf(instant: Date, tz: string = DEFAULT_PRAYER_TIMEZONE): string {
  return new Date(instant.getTime() + offsetMinutes(instant, tz) * 60000).toISOString().slice(11, 16);
}
