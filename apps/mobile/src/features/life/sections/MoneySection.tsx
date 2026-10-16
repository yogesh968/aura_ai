import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, EmptyState, ListItem, ProgressBar, SectionHeader, Text } from '@/components/ui';
import { useEntities } from '@/lib/data';
import { useSettingsStore } from '@/lib/settings';
import { money, relativeDay } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { MonthSelector, StatTile } from '../components';
import { computeFinanceSummary, inLocalMonth, localMonthKey } from '../helpers';

export function MoneySection() {
  const router = useRouter();
  const { colors } = useTheme();
  const currency = useSettingsStore((s) => s.preferences.currency);
  const [month, setMonth] = useState(localMonthKey());
  const { data: transactions = [] } = useEntities('transaction');
  const { data: budgets = [] } = useEntities('budget');
  const { data: bills = [] } = useEntities('recurringPayment');

  const summary = useMemo(() => computeFinanceSummary(transactions, budgets, bills, month, currency), [transactions, budgets, bills, month, currency]);
  const recent = useMemo(
    () => transactions.filter((t) => inLocalMonth(t.occurredAt, month)).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 8),
    [transactions, month],
  );
  const empty = transactions.length === 0 && budgets.length === 0 && bills.length === 0;

  return (
    <View>
      <MonthSelector month={month} onChange={setMonth} />
      <View style={styles.stats}>
        <StatTile label="Income" value={money(summary.incomeMinor, currency)} tone="success" icon="arrow-down-outline" />
        <StatTile label="Spent" value={money(summary.expenseMinor, currency)} icon="arrow-up-outline" />
      </View>
      <View style={[styles.stats, { marginTop: 10 }]}>
        <StatTile label="Net" value={money(summary.netMinor, currency)} tone={summary.netMinor < 0 ? 'danger' : 'success'} icon="wallet-outline" />
      </View>
      {summary.otherCurrencies.length ? (
        <Text variant="small" color="textMuted" style={{ marginTop: 8 }}>
          Also recorded in {summary.otherCurrencies.join(', ')} — not included above (no conversion).
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button title="Add" icon="add" size="sm" onPress={() => router.push('/finance/transaction/new')} />
        <Button title="Budgets" icon="pie-chart-outline" size="sm" variant="secondary" onPress={() => router.push('/finance/budgets')} />
        <Button title="Bills" icon="receipt-outline" size="sm" variant="secondary" onPress={() => router.push('/finance/bills')} />
        <Button title="Overview" icon="stats-chart-outline" size="sm" variant="secondary" onPress={() => router.push('/finance')} />
      </View>

      {empty ? (
        <EmptyState
          icon="wallet-outline"
          title="Track your money"
          body="Add income and expenses manually, set budgets and get bill reminders. AURA never connects to your bank."
          actionLabel="Add first transaction"
          onAction={() => router.push('/finance/transaction/new')}
        />
      ) : null}

      {summary.byCategory.length ? (
        <>
          <SectionHeader title="Spending by category" />
          <Card style={{ gap: 14 }}>
            {summary.byCategory.slice(0, 8).map((c) => {
              const over = c.budgetMinor != null && c.spentMinor > c.budgetMinor;
              return (
                <View key={c.category} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Text variant="caption" numberOfLines={1} style={{ flex: 1 }}>
                      {c.category}
                    </Text>
                    <Text variant="caption" color={over ? 'danger' : 'textMuted'}>
                      {money(c.spentMinor, currency)}
                      {c.budgetMinor != null ? ` / ${money(c.budgetMinor, currency)}` : ''}
                    </Text>
                  </View>
                  {c.budgetMinor != null ? (
                    <ProgressBar value={c.spentMinor / c.budgetMinor} color={over ? colors.danger : c.spentMinor / c.budgetMinor > 0.8 ? colors.warning : colors.success} label={`${c.category} budget used`} />
                  ) : (
                    <ProgressBar value={summary.expenseMinor ? c.spentMinor / summary.expenseMinor : 0} label={`${c.category} share of spending`} />
                  )}
                </View>
              );
            })}
          </Card>
        </>
      ) : null}

      {summary.upcomingBills.length ? (
        <>
          <SectionHeader title="Upcoming bills" action="All bills" onAction={() => router.push('/finance/bills')} />
          <Card padded={false} style={{ paddingHorizontal: 12 }}>
            {summary.upcomingBills.slice(0, 5).map((b) => (
              <ListItem key={b.id} icon="receipt-outline" title={b.name} subtitle={`Due ${relativeDay(b.dueAt)}`} right={<Text variant="caption">{money(b.amountMinor, currency)}</Text>} onPress={() => router.push(`/finance/bill/${b.id}`)} />
            ))}
          </Card>
        </>
      ) : null}

      {recent.length ? (
        <>
          <SectionHeader title="Recent" action="See all" onAction={() => router.push('/finance')} />
          <Card padded={false} style={{ paddingHorizontal: 12 }}>
            {recent.map((t) => (
              <ListItem
                key={t.id}
                icon={t.kind === 'income' ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
                iconColor={t.kind === 'income' ? colors.success : colors.textMuted}
                title={t.note || t.category}
                subtitle={`${t.category} · ${relativeDay(t.occurredAt)}`}
                right={
                  <Text variant="caption" color={t.kind === 'income' ? 'success' : 'text'} weight="600">
                    {t.kind === 'income' ? '+' : '−'}
                    {money(t.amountMinor, t.currency)}
                  </Text>
                }
                onPress={() => router.push(`/finance/transaction/${t.id}`)}
              />
            ))}
          </Card>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 10, marginTop: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
});
