import type { Recurrence } from './entities';
import { zonedParts, zonedTimeToUtc } from './dates';

interface Ymd {
  year: number;
  month: number;
  day: number;
}

function shiftDays(d: Ymd, days: number): Ymd {
  const x = new Date(Date.UTC(d.year, d.month - 1, d.day + days));
  return { year: x.getUTCFullYear(), month: x.getUTCMonth() + 1, day: x.getUTCDate() };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Smallest occurrence of a recurring item (the anchor itself included) that is
 * strictly after `after`. Wall-clock time is preserved in `timeZone`, so a
 * 09:00 daily reminder stays at 09:00 across DST changes. Monthly/yearly items
 * anchored on the 31st clamp to the last day of shorter months.
 * Returns null for non-recurring items.
 */
export function nextOccurrence(anchor: Date, recurrence: Recurrence, after: Date, timeZone: string): Date | null {
  if (recurrence === 'none') return null;
  const a = zonedParts(anchor, timeZone);
  const wall = { hour: a.hour, minute: a.minute, second: a.second };
  let cursor: Ymd = { year: a.year, month: a.month, day: a.day };
  let step = 0; // number of periods advanced (for month/year clamping)

  // Skip ahead for day-based recurrences far in the past.
  if (recurrence === 'daily' || recurrence === 'weekdays' || recurrence === 'weekly') {
    const gapDays = Math.floor((after.getTime() - anchor.getTime()) / 86_400_000) - 2;
    if (gapDays > 0) {
      const period = recurrence === 'weekly' ? 7 : 1;
      cursor = shiftDays(cursor, Math.floor(gapDays / period) * period);
    }
  }

  for (let i = 0; i < 2000; i++) {
    const candidate = zonedTimeToUtc({ ...cursor, ...wall }, timeZone);
    if (candidate.getTime() > after.getTime()) {
      const weekday = zonedParts(candidate, timeZone).weekday;
      if (recurrence !== 'weekdays' || (weekday >= 1 && weekday <= 5)) return candidate;
    }
    step += 1;
    switch (recurrence) {
      case 'daily':
      case 'weekdays':
        cursor = shiftDays(cursor, 1);
        break;
      case 'weekly':
        cursor = shiftDays(cursor, 7);
        break;
      case 'monthly': {
        const total = a.month - 1 + step;
        const year = a.year + Math.floor(total / 12);
        const month = (total % 12) + 1;
        cursor = { year, month, day: Math.min(a.day, daysInMonth(year, month)) };
        break;
      }
      case 'yearly': {
        const year = a.year + step;
        cursor = { year, month: a.month, day: Math.min(a.day, daysInMonth(year, a.month)) };
        break;
      }
    }
  }
  return null;
}

export function recurrenceLabel(r: Recurrence): string {
  return {
    none: 'Does not repeat',
    daily: 'Every day',
    weekdays: 'Every weekday',
    weekly: 'Every week',
    monthly: 'Every month',
    yearly: 'Every year',
  }[r];
}
