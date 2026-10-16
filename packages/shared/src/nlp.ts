import * as chrono from 'chrono-node';
import type { Recurrence } from './entities';

/**
 * Deterministic quick-add parser for capture without AI (works offline on the
 * device). Handles English plus common Hinglish time words, e.g.
 *   "Remind me tomorrow at 9 AM to call mom"
 *   "kal subah 9 baje doctor appointment yaad dilana"
 *   "Pay rent every month on the 1st !high"
 */

export interface QuickAddResult {
  kind: 'reminder' | 'task' | 'event';
  title: string;
  /** ISO string, or null if no time was found. */
  at: string | null;
  /** Whether the user specified a time of day (vs. just a date). */
  hasTime: boolean;
  recurrence: Recurrence;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

const HINGLISH: [RegExp, string | ((...m: string[]) => string)][] = [
  [/\bparso\b/gi, 'in 2 days'],
  [/\bkal\b/gi, 'tomorrow'],
  [/\baaj\b/gi, 'today'],
  [/\bsubah\b/gi, 'morning'],
  [/\bdopahar\b/gi, 'afternoon'],
  [/\bshaam\b/gi, 'evening'],
  [/\braat\b/gi, 'night'],
  [/\b(\d{1,2})(?::(\d{2}))?\s*baje\b/gi, (_m: string, h: string, mm?: string) => `at ${h}${mm ? `:${mm}` : ''}`],
  [/\bhar\s+din\b/gi, 'every day'],
  [/\broz\b/gi, 'every day'],
];

const REMIND_PATTERNS = [
  /^\s*remind\s+me\s+(to\s+)?/i,
  /\byaad\s+(dila(na|o|dena|dijiye)|karana)\b/i,
  /^\s*set\s+(a\s+)?reminder\s+(to\s+|for\s+)?/i,
];
const EVENT_PATTERNS = /\b(meeting|appointment|birthday|dinner|lunch|call with|interview|party|flight)\b/i;

const RECURRENCE_PATTERNS: [RegExp, Recurrence][] = [
  [/\b(every\s*day|daily|each\s+day)\b/i, 'daily'],
  [/\b(every\s+weekday|weekdays|on\s+weekdays)\b/i, 'weekdays'],
  [/\b(every\s+week|weekly|every\s+(mon|tues|wednes|thurs|fri|satur|sun)day)\b/i, 'weekly'],
  [/\b(every\s+month|monthly)\b/i, 'monthly'],
  [/\b(every\s+year|yearly|annually)\b/i, 'yearly'],
];

export function parseQuickAdd(input: string, ref: Date = new Date()): QuickAddResult {
  let text = input.trim();
  for (const [re, rep] of HINGLISH) text = text.replace(re, rep as string);

  let kind: QuickAddResult['kind'] = 'task';
  for (const re of REMIND_PATTERNS) {
    if (re.test(text)) {
      kind = 'reminder';
      text = text.replace(re, ' ');
    }
  }

  let priority: QuickAddResult['priority'] = 'medium';
  const prio = /(?:^|\s)!(low|medium|high|urgent)\b/i.exec(text) ?? /\b(urgent|asap)\b/i.exec(text);
  if (prio) {
    const p = prio[1]!.toLowerCase();
    priority = (p === 'asap' ? 'urgent' : p) as QuickAddResult['priority'];
    text = text.replace(prio[0], ' ');
  }

  let recurrence: Recurrence = 'none';
  for (const [re, r] of RECURRENCE_PATTERNS) {
    const m = re.exec(text);
    if (m) {
      recurrence = r;
      // keep weekday names for chrono to anchor ("every monday" -> "monday")
      const weekday = /(mon|tues|wednes|thurs|fri|satur|sun)day/i.exec(m[0]);
      text = text.replace(m[0], weekday ? weekday[0] : ' ');
      break;
    }
  }

  const results = chrono.parse(text, ref, { forwardDate: true });
  let at: string | null = null;
  let hasTime = false;
  if (results.length > 0) {
    const r = results[0]!;
    const date = r.start.date();
    hasTime = r.start.isCertain('hour');
    if (!hasTime) {
      // Date without time: default to 9:00 for reminders, end of day for tasks.
      if (kind === 'reminder') date.setHours(9, 0, 0, 0);
      else date.setHours(23, 59, 0, 0);
    }
    at = date.toISOString();
    text = text.slice(0, r.index) + ' ' + text.slice(r.index + r.text.length);
  }

  if (kind === 'task' && EVENT_PATTERNS.test(text) && hasTime) kind = 'event';

  const title =
    text
      .replace(/\b(on|at|by|for|to)\s*$/i, '')
      .replace(/^\s*(to|for)\s+/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .replace(/^[,.;:-]+|[,.;:-]+$/g, '')
      .trim() || input.trim();

  return { kind, title: title.charAt(0).toUpperCase() + title.slice(1), at, hasTime, recurrence, priority };
}
