import { buildEntity, type HabitLog } from '@aura/shared';
import {
  advanceDueDate,
  computeFinanceSummary,
  habitDailyTotals,
  habitPeriodProgress,
  habitStreak,
  isoWeekKey,
  lastNDays,
  shiftMonth,
  wellnessByDay,
} from '../helpers';

let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const log = (habitId: string, date: string, value = 1): HabitLog => buildEntity('habitLog', id(), { habitId, date, value });

describe('habits', () => {
  const habitId = id();
  const daily = { id: habitId, frequency: 'daily' as const, target: 1 };

  it('aggregates logs per day', () => {
    const totals = habitDailyTotals([log(habitId, '2026-10-15'), log(habitId, '2026-10-15', 2), log(id(), '2026-10-15')], habitId);
    expect(totals.get('2026-10-15')).toBe(3);
  });

  it('counts consecutive days ending today', () => {
    const logs = ['2026-10-13', '2026-10-14', '2026-10-15'].map((d) => log(habitId, d));
    expect(habitStreak(daily, logs, '2026-10-15')).toBe(3);
  });

  it('does not break the streak when today is not done yet', () => {
    const logs = ['2026-10-13', '2026-10-14'].map((d) => log(habitId, d));
    expect(habitStreak(daily, logs, '2026-10-15')).toBe(2);
  });

  it('breaks on a missed day and respects the target', () => {
    const logs = [log(habitId, '2026-10-12'), log(habitId, '2026-10-14')];
    expect(habitStreak(daily, logs, '2026-10-15')).toBe(1);
    expect(habitStreak({ ...daily, target: 2 }, logs, '2026-10-15')).toBe(0);
  });

  it('counts weekly streaks by ISO week', () => {
    const weekly = { id: habitId, frequency: 'weekly' as const, target: 2 };
    // Weeks 41 and 42 of 2026 each have 2 logs.
    const logs = ['2026-10-05', '2026-10-07', '2026-10-12', '2026-10-15'].map((d) => log(habitId, d));
    expect(isoWeekKey('2026-10-15')).toBe('2026-W42');
    expect(habitStreak(weekly, logs, '2026-10-15')).toBe(2);
    expect(habitPeriodProgress(weekly, logs, '2026-10-15')).toBe(2);
  });

  it('lists the last n days oldest first', () => {
    expect(lastNDays(3, '2026-10-01')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01']);
  });
});

describe('wellness', () => {
  it('sums cumulative metrics and keeps the latest point reading', () => {
    const e = (metric: 'water' | 'weight', value: number, at: string) =>
      buildEntity('wellness', id(), { metric, value, unit: 'x', date: '2026-10-15' }, new Date(at));
    const entries = [e('water', 250, '2026-10-15T08:00:00Z'), e('water', 500, '2026-10-15T09:00:00Z'), e('weight', 70, '2026-10-15T07:00:00Z'), e('weight', 69.5, '2026-10-15T20:00:00Z')];
    expect(wellnessByDay(entries, 'water').get('2026-10-15')).toBe(750);
    expect(wellnessByDay(entries, 'weight').get('2026-10-15')).toBe(69.5);
  });
});

describe('finance', () => {
  it('summarizes one currency, lists others, and joins budgets', () => {
    const now = new Date(2026, 9, 15, 12);
    const at = new Date(2026, 9, 10, 12).toISOString();
    const tx = (kind: 'income' | 'expense', amountMinor: number, category: string, currency = 'INR', occurredAt = at) =>
      buildEntity('transaction', id(), { kind, amountMinor, currency, category, occurredAt });
    const s = computeFinanceSummary(
      [
        tx('income', 100_000, 'Salary'),
        tx('expense', 20_000, 'Groceries'),
        tx('expense', 5_000, 'Groceries'),
        tx('expense', 999, 'Apps', 'USD'),
        tx('expense', 7_000, 'Groceries', 'INR', new Date(2026, 8, 30, 12).toISOString()),
      ],
      [buildEntity('budget', id(), { category: 'Groceries', limitMinor: 20_000, currency: 'INR' }), buildEntity('budget', id(), { category: 'Travel', limitMinor: 50_000, currency: 'INR' })],
      [buildEntity('recurringPayment', id(), { name: 'Rent', kind: 'bill', amountMinor: 30_000, currency: 'INR', category: 'Rent', frequency: 'monthly', nextDueAt: new Date(2026, 9, 20).toISOString() })],
      '2026-10',
      'INR',
      now,
    );
    expect(s).toMatchObject({ incomeMinor: 100_000, expenseMinor: 25_000, netMinor: 75_000, otherCurrencies: ['USD'] });
    expect(s.byCategory).toEqual([
      { category: 'Groceries', spentMinor: 25_000, budgetMinor: 20_000 },
      { category: 'Travel', spentMinor: 0, budgetMinor: 50_000 },
    ]);
    expect(s.upcomingBills.map((b) => b.name)).toEqual(['Rent']);
  });

  it('shifts months across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });

  it('advances bill due dates in local time with month-end clamping', () => {
    const jan31 = new Date(2026, 0, 31, 9).toISOString();
    const feb = new Date(advanceDueDate(jan31, 'monthly'));
    expect([feb.getMonth(), feb.getDate(), feb.getHours()]).toEqual([1, 28, 9]);
    const week = new Date(advanceDueDate(new Date(2026, 9, 15, 9).toISOString(), 'weekly'));
    expect([week.getMonth(), week.getDate()]).toEqual([9, 22]);
    const leap = new Date(advanceDueDate(new Date(2027, 1, 28, 9).toISOString(), 'yearly'));
    expect([leap.getFullYear(), leap.getMonth(), leap.getDate()]).toEqual([2028, 1, 28]);
  });
});
