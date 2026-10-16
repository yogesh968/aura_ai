import { evaluateExpression, CalcError } from './calc';
import { convertUnits, UnitError } from './units';
import { nextOccurrence } from './recurrence';
import { dateKeyInTz, formatIsoInTz, monthRangeInTz, startOfDayInTz, zonedTimeToUtc } from './dates';
import { formatMoney, parseMoneyInput, toMinor } from './money';
import { parseQuickAdd } from './nlp';
import { buildEntity } from './factories';
import { taskSchema } from './entities';
import { toolDefinitions } from './tools';

describe('calculator', () => {
  it.each([
    ['2 + 3 * 4', 14],
    ['(2 + 3) * 4', 20],
    ['2 ^ 10', 1024],
    ['-3 + 5', 2],
    ['15% of 2400', 360],
    ['sqrt(16) + abs(-2)', 6],
    ['10 mod 3', 1],
    ['2pi', 2 * Math.PI],
    ['1,250 + 750', 2000],
    ['max(3, 9, 4)', 9],
  ])('%s = %d', (expr, expected) => {
    expect(evaluateExpression(expr)).toBeCloseTo(expected, 10);
  });

  it.each(['1 / 0', 'process.exit()', 'alert(1)', '2 +', '((1)', 'constructor'])('rejects %s', (expr) => {
    expect(() => evaluateExpression(expr)).toThrow(CalcError);
  });
});

describe('unit conversion', () => {
  it('converts length, temperature and data', () => {
    expect(convertUnits(5, 'km', 'mi').value).toBeCloseTo(3.10686, 4);
    expect(convertUnits(100, 'celsius', 'f').value).toBeCloseTo(212, 6);
    expect(convertUnits(1, 'gb', 'mb').value).toBe(1024);
    expect(convertUnits(2, 'cups', 'ml').value).toBeCloseTo(480, 6);
  });
  it('rejects mismatched dimensions and unknown units', () => {
    expect(() => convertUnits(1, 'kg', 'km')).toThrow(UnitError);
    expect(() => convertUnits(1, 'furlongs', 'm')).toThrow(UnitError);
  });
});

describe('timezone helpers', () => {
  const tz = 'Asia/Kolkata';
  it('converts wall clock to UTC', () => {
    const d = zonedTimeToUtc({ year: 2026, month: 10, day: 15, hour: 9, minute: 0 }, tz);
    expect(d.toISOString()).toBe('2026-10-15T03:30:00.000Z');
    expect(formatIsoInTz(d, tz)).toBe('2026-10-15T09:00:00+05:30');
  });
  it('handles date keys across midnight', () => {
    expect(dateKeyInTz(new Date('2026-10-15T20:00:00Z'), tz)).toBe('2026-10-16');
    expect(startOfDayInTz('2026-10-16', tz).toISOString()).toBe('2026-10-15T18:30:00.000Z');
  });
  it('handles DST zones', () => {
    const d = zonedTimeToUtc({ year: 2026, month: 7, day: 1, hour: 9 }, 'America/New_York');
    expect(d.toISOString()).toBe('2026-07-01T13:00:00.000Z');
  });
  it('computes month ranges', () => {
    const { start, end } = monthRangeInTz('2026-02', 'UTC');
    expect(start.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-02-28T23:59:59.999Z');
  });
});

describe('recurrence', () => {
  const tz = 'America/New_York';
  const anchor = new Date('2026-03-01T14:00:00Z'); // 09:00 EST

  it('keeps wall-clock time across DST for daily items', () => {
    const next = nextOccurrence(anchor, 'daily', new Date('2026-03-09T00:00:00Z'), tz)!;
    expect(next.toISOString()).toBe('2026-03-09T13:00:00.000Z'); // 09:00 EDT
  });
  it('returns the anchor itself if it is still in the future', () => {
    expect(nextOccurrence(anchor, 'weekly', new Date('2026-02-01T00:00:00Z'), tz)!.toISOString()).toBe(
      anchor.toISOString(),
    );
  });
  it('clamps monthly items to short months', () => {
    const jan31 = new Date('2026-01-31T10:00:00Z');
    expect(nextOccurrence(jan31, 'monthly', jan31, 'UTC')!.toISOString()).toBe('2026-02-28T10:00:00.000Z');
  });
  it('skips weekends for weekdays', () => {
    const fri = new Date('2026-10-16T09:00:00Z'); // Friday
    expect(nextOccurrence(fri, 'weekdays', fri, 'UTC')!.toISOString()).toBe('2026-10-19T09:00:00.000Z');
  });
  it('returns null for one-off items', () => {
    expect(nextOccurrence(anchor, 'none', anchor, tz)).toBeNull();
  });
});

describe('money', () => {
  it('uses minor units per currency', () => {
    expect(toMinor(250.5, 'INR')).toBe(25050);
    expect(toMinor(1000, 'JPY')).toBe(1000);
    expect(parseMoneyInput('1,250.75', 'USD')).toBe(125075);
    expect(parseMoneyInput('abc', 'USD')).toBeNull();
    expect(formatMoney(125075, 'USD', 'en-US')).toBe('$1,250.75');
  });
});

describe('quick add parser', () => {
  const ref = new Date(2026, 9, 15, 10, 0, 0); // local time, Thu 15 Oct 2026 10:00

  it('parses English reminders', () => {
    const r = parseQuickAdd('Remind me tomorrow at 9 AM to call mom', ref);
    expect(r.kind).toBe('reminder');
    expect(r.title).toBe('Call mom');
    const at = new Date(r.at!);
    expect(at.getDate()).toBe(16);
    expect(at.getHours()).toBe(9);
    expect(r.hasTime).toBe(true);
  });

  it('parses Hinglish', () => {
    const r = parseQuickAdd('kal subah 9 baje doctor appointment yaad dilana', ref);
    expect(r.kind).toBe('reminder');
    const at = new Date(r.at!);
    expect(at.getDate()).toBe(16);
    expect(at.getHours()).toBe(9);
    expect(r.title.toLowerCase()).toContain('doctor appointment');
  });

  it('detects recurrence and priority', () => {
    const r = parseQuickAdd('Pay rent every month !high', ref);
    expect(r.recurrence).toBe('monthly');
    expect(r.priority).toBe('high');
    expect(r.title).toBe('Pay rent');
  });

  it('keeps plain tasks as tasks without a date', () => {
    const r = parseQuickAdd('Buy groceries', ref);
    expect(r).toMatchObject({ kind: 'task', title: 'Buy groceries', at: null, recurrence: 'none' });
  });
});

describe('entities and tools', () => {
  it('builds valid entities with defaults', () => {
    const t = buildEntity('task', '6f1c5f1e-7a0f-4c55-9f43-1d1b8f0e8c11', { title: 'Hello' });
    expect(taskSchema.parse(t)).toBeTruthy();
  });

  it('declares no unrestricted tools', () => {
    const names = Object.keys(toolDefinitions);
    for (const forbidden of ['shell', 'exec', 'sql', 'run_code', 'eval']) {
      expect(names.some((n) => n.includes(forbidden))).toBe(false);
    }
    for (const [name, def] of Object.entries(toolDefinitions)) {
      expect(def.name).toBe(name);
      if (name.startsWith('delete_') || name === 'save_memory') expect(def.permission).toBe('confirm');
      if (def.permission === 'confirm') expect(def.automatable).toBe(false);
    }
  });
});
