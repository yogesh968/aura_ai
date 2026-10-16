/**
 * Timezone-aware date helpers built on Intl (no external tz database needed).
 * A "date key" is a calendar date in a given timezone, formatted YYYY-MM-DD.
 */

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday ?? 'Sun'] ?? 0,
  };
}

/** Offset of `timeZone` from UTC at `date`, in minutes (e.g. +330 for IST). */
export function tzOffsetMinutes(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - (date.getTime() - date.getMilliseconds())) / 60000);
}

const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, '0');

export function dateKeyInTz(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Local (device) date key, using the JS runtime's timezone. */
export function localDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDateKey(key: string): { year: number; month: number; day: number } {
  const [y, m, d] = key.split('-').map(Number);
  return { year: y ?? 1970, month: m ?? 1, day: d ?? 1 };
}

/** Convert a wall-clock time in `timeZone` to a UTC Date. */
export function zonedTimeToUtc(
  wall: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number },
  timeZone: string,
): Date {
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour ?? 0, wall.minute ?? 0, wall.second ?? 0);
  // Two passes handle DST transitions correctly in practice.
  let offset = tzOffsetMinutes(new Date(guess), timeZone);
  let result = guess - offset * 60000;
  const offset2 = tzOffsetMinutes(new Date(result), timeZone);
  if (offset2 !== offset) {
    offset = offset2;
    result = guess - offset * 60000;
  }
  return new Date(result);
}

export function startOfDayInTz(key: string, timeZone: string): Date {
  return zonedTimeToUtc({ ...parseDateKey(key), hour: 0, minute: 0 }, timeZone);
}

export function endOfDayInTz(key: string, timeZone: string): Date {
  const next = addDaysToKey(key, 1);
  return new Date(startOfDayInTz(next, timeZone).getTime() - 1);
}

export function addDaysToKey(key: string, days: number): string {
  const { year, month, day } = parseDateKey(key);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** ISO string with the timezone's offset, e.g. 2026-10-15T09:00:00+05:30. */
export function formatIsoInTz(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  const off = tzOffsetMinutes(date, timeZone);
  const sign = off >= 0 ? '+' : '-';
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${sign}${pad(
    Math.floor(Math.abs(off) / 60),
  )}:${pad(Math.abs(off) % 60)}`;
}

export function weekdayName(weekday: number): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday] ?? '';
}

export function monthKey(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad(p.month)}`;
}

export function monthRangeInTz(month: string, timeZone: string): { start: Date; end: Date } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const start = zonedTimeToUtc({ year: y, month: m, day: 1 }, timeZone);
  const nextMonth = m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 };
  const end = new Date(zonedTimeToUtc({ ...nextMonth, day: 1 }, timeZone).getTime() - 1);
  return { start, end };
}

export function parseTimeOfDay(hhmm: string): { hour: number; minute: number } {
  const [h, m] = hhmm.split(':').map(Number);
  return { hour: h ?? 0, minute: m ?? 0 };
}

export function nowIso(): string {
  return new Date().toISOString();
}
