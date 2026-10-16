import { fromMinor, minorDigits, monthKey, monthRangeInTz, type FinanceSummary, type Transaction } from '@aura/shared';
import type { EntityService } from '../entities/service';

export class FinanceService {
  constructor(private readonly entities: EntityService) {}

  async summary(userId: string, opts: { month?: string; currency: string; timezone: string; now?: Date }): Promise<FinanceSummary> {
    const now = opts.now ?? new Date();
    const month = opts.month ?? monthKey(now, opts.timezone);
    const { start, end } = monthRangeInTz(month, opts.timezone);

    const [transactions, budgets, bills] = await Promise.all([
      this.entities.list(userId, 'transaction', {
        where: { occurredAt: { gte: start, lte: end } },
        orderBy: { occurredAt: 'desc' },
        take: 500,
      }),
      this.entities.list(userId, 'budget', { take: 100 }),
      this.entities.list(userId, 'recurringPayment', {
        where: { active: true, nextDueAt: { lte: new Date(now.getTime() + 30 * 86_400_000) } },
        orderBy: { nextDueAt: 'asc' },
        take: 50,
      }),
    ]);

    const inCurrency = transactions.filter((t) => t.currency === opts.currency);
    const otherCurrencies = [...new Set(transactions.filter((t) => t.currency !== opts.currency).map((t) => t.currency))];
    const sum = (list: Transaction[]) => list.reduce((s, t) => s + t.amountMinor, 0);
    const income = sum(inCurrency.filter((t) => t.kind === 'income'));
    const expense = sum(inCurrency.filter((t) => t.kind === 'expense'));

    const byCategory = new Map<string, number>();
    for (const t of inCurrency) {
      if (t.kind === 'expense') byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.amountMinor);
    }
    const budgetByCategory = new Map(
      budgets.filter((b) => b.currency === opts.currency).map((b) => [b.category, b.limitMinor] as const),
    );
    for (const cat of budgetByCategory.keys()) if (!byCategory.has(cat)) byCategory.set(cat, 0);

    return {
      month,
      currency: opts.currency,
      incomeMinor: income,
      expenseMinor: expense,
      netMinor: income - expense,
      byCategory: [...byCategory.entries()]
        .map(([category, spentMinor]) => ({ category, spentMinor, budgetMinor: budgetByCategory.get(category) ?? null }))
        .sort((a, b) => b.spentMinor - a.spentMinor),
      upcomingBills: bills
        .filter((b) => b.currency === opts.currency)
        .map((b) => ({ id: b.id, name: b.name, amountMinor: b.amountMinor, dueAt: b.nextDueAt })),
      otherCurrencies,
    };
  }

  async exportCsv(userId: string): Promise<string> {
    const all: Transaction[] = [];
    let before: Date | undefined;
    for (;;) {
      const page = await this.entities.list(userId, 'transaction', {
        where: before ? { occurredAt: { lt: before } } : {},
        orderBy: { occurredAt: 'desc' },
        take: 500,
      });
      all.push(...page);
      if (page.length < 500) break;
      before = new Date(page[page.length - 1]!.occurredAt);
    }
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const header = 'date,kind,amount,currency,category,note';
    const lines = all.map((t) =>
      [
        t.occurredAt,
        t.kind,
        fromMinor(t.amountMinor, t.currency).toFixed(minorDigits(t.currency)),
        t.currency,
        esc(t.category),
        esc(t.note ?? ''),
      ].join(','),
    );
    return [header, ...lines].join('\n');
  }
}
