import {
  addDaysToKey,
  localDateKey,
  parseDateKey,
  type Budget,
  type FinanceSummary,
  type Habit,
  type HabitLog,
  type RecurringPayment,
  type Transaction,
  type WellnessEntry,
  type WellnessMetric,
} from '@aura/shared';

/** Date keys for the last `n` days ending at `today` (oldest first). */
export function lastNDays(n: number, today: string = localDateKey()): string[] {
  return Array.from({ length: n }, (_, i) => addDaysToKey(today, i - (n - 1)));
}

/** Sum of habit log values per day for one habit. */
export function habitDailyTotals(logs: HabitLog[], habitId: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const l of logs) {
    if (l.habitId !== habitId || l.deletedAt) continue;
    map.set(l.date, (map.get(l.date) ?? 0) + l.value);
  }
  return map;
}

/** ISO-8601 week key, e.g. "2026-W42". */
export function isoWeekKey(dateKey: string): string {
  const { year, month, day } = parseDateKey(dateKey);
  const d = new Date(Date.UTC(year, month - 1, day));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Current streak.
 * Daily habits: consecutive days meeting the target, ending today (today not
 * yet met doesn't break the streak — it counts from yesterday).
 * Weekly habits: consecutive ISO weeks meeting the target, same rule for the
 * current week.
 */
export function habitStreak(habit: Pick<Habit, 'id' | 'frequency' | 'target'>, logs: HabitLog[], today: string = localDateKey()): number {
  const totals = habitDailyTotals(logs, habit.id);
  if (habit.frequency === 'daily') {
    let streak = 0;
    let key = today;
    if ((totals.get(key) ?? 0) < habit.target) key = addDaysToKey(key, -1);
    while ((totals.get(key) ?? 0) >= habit.target) {
      streak++;
      key = addDaysToKey(key, -1);
    }
    return streak;
  }
  const weekly = new Map<string, number>();
  for (const [date, v] of totals) weekly.set(isoWeekKey(date), (weekly.get(isoWeekKey(date)) ?? 0) + v);
  let streak = 0;
  let key = today;
  if ((weekly.get(isoWeekKey(key)) ?? 0) < habit.target) key = addDaysToKey(key, -7);
  while ((weekly.get(isoWeekKey(key)) ?? 0) >= habit.target) {
    streak++;
    key = addDaysToKey(key, -7);
  }
  return streak;
}

/** Progress in the current period (today for daily, this ISO week for weekly). */
export function habitPeriodProgress(habit: Pick<Habit, 'id' | 'frequency'>, logs: HabitLog[], today: string = localDateKey()): number {
  const totals = habitDailyTotals(logs, habit.id);
  if (habit.frequency === 'daily') return totals.get(today) ?? 0;
  const week = isoWeekKey(today);
  let sum = 0;
  for (const [date, v] of totals) if (isoWeekKey(date) === week) sum += v;
  return sum;
}

/** Point-in-time metrics keep the latest reading; others accumulate over the day. */
export const POINT_METRICS: WellnessMetric[] = ['weight', 'mood'];

export function wellnessByDay(entries: WellnessEntry[], metric: WellnessMetric): Map<string, number> {
  const map = new Map<string, number>();
  const sorted = entries.filter((e) => e.metric === metric && !e.deletedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const e of sorted) {
    map.set(e.date, POINT_METRICS.includes(metric) ? e.value : (map.get(e.date) ?? 0) + e.value);
  }
  return map;
}

/** "YYYY-MM" for a local date. */
export function localMonthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(y, m - 1 + delta, 1);
  return localMonthKey(d);
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function inLocalMonth(iso: string, month: string): boolean {
  return localMonthKey(new Date(iso)) === month;
}

/**
 * Finance summary computed on the device, same shape as the server's.
 * Only the given currency is summed; other currencies are listed, never converted.
 */
export function computeFinanceSummary(
  transactions: Transaction[],
  budgets: Budget[],
  bills: RecurringPayment[],
  month: string,
  currency: string,
  now: Date = new Date(),
): FinanceSummary {
  const inMonth = transactions.filter((t) => !t.deletedAt && inLocalMonth(t.occurredAt, month));
  const same = inMonth.filter((t) => t.currency === currency);
  const income = same.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amountMinor, 0);
  const expense = same.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amountMinor, 0);

  const byCategory = new Map<string, number>();
  for (const t of same) if (t.kind === 'expense') byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.amountMinor);
  const budgetMap = new Map(budgets.filter((b) => !b.deletedAt && b.currency === currency).map((b) => [b.category, b.limitMinor] as const));
  for (const c of budgetMap.keys()) if (!byCategory.has(c)) byCategory.set(c, 0);

  const horizon = now.getTime() + 30 * 86_400_000;
  return {
    month,
    currency,
    incomeMinor: income,
    expenseMinor: expense,
    netMinor: income - expense,
    byCategory: [...byCategory.entries()]
      .map(([category, spentMinor]) => ({ category, spentMinor, budgetMinor: budgetMap.get(category) ?? null }))
      .sort((a, b) => b.spentMinor - a.spentMinor),
    upcomingBills: bills
      .filter((b) => !b.deletedAt && b.active && b.currency === currency && new Date(b.nextDueAt).getTime() <= horizon)
      .sort((a, b) => a.nextDueAt.localeCompare(b.nextDueAt))
      .map((b) => ({ id: b.id, name: b.name, amountMinor: b.amountMinor, dueAt: b.nextDueAt })),
    otherCurrencies: [...new Set(inMonth.filter((t) => t.currency !== currency).map((t) => t.currency))].sort(),
  };
}

/**
 * Advance a bill's due date by one period, in local time. Monthly/yearly dates
 * clamp to the end of shorter months (31 Jan → 28/29 Feb).
 */
export function advanceDueDate(iso: string, frequency: RecurringPayment['frequency']): string {
  const d = new Date(iso);
  if (frequency === 'weekly') {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7, d.getHours(), d.getMinutes(), d.getSeconds()).toISOString();
  }
  const months = frequency === 'monthly' ? 1 : 12;
  const targetMonth = d.getMonth() + months;
  const lastDay = new Date(d.getFullYear(), targetMonth + 1, 0).getDate();
  return new Date(d.getFullYear(), targetMonth, Math.min(d.getDate(), lastDay), d.getHours(), d.getMinutes(), d.getSeconds()).toISOString();
}

export const MOOD_FACES = ['😞', '🙁', '😐', '🙂', '😄'] as const;

export const WELLNESS_META: Record<WellnessMetric, { label: string; unit: string; icon: string; step: number }> = {
  water: { label: 'Water', unit: 'ml', icon: 'water-outline', step: 250 },
  sleep: { label: 'Sleep', unit: 'h', icon: 'moon-outline', step: 0.5 },
  exercise: { label: 'Exercise', unit: 'min', icon: 'barbell-outline', step: 10 },
  steps: { label: 'Steps', unit: 'steps', icon: 'footsteps-outline', step: 1000 },
  weight: { label: 'Weight', unit: 'kg', icon: 'scale-outline', step: 0.1 },
  mood: { label: 'Mood', unit: '/5', icon: 'happy-outline', step: 1 },
};

export function isWellnessMetric(v: string): v is WellnessMetric {
  return v in WELLNESS_META;
}
