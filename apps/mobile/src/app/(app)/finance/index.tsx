import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { FinanceSummary } from '@aura/shared';
import {
  Badge,
  Button,
  Card,
  ChipGroup,
  Divider,
  EmptyState,
  Fab,
  IconButton,
  ListItem,
  ProgressBar,
  Screen,
  ScreenHeader,
  SectionHeader,
  Text,
  TextField,
} from '@/components/ui';
import { endpoints } from '@/lib/api/endpoints';
import { errorMessage, isNetworkError } from '@/lib/api/client';
import { useEntities } from '@/lib/data';
import { formatDate, money, relativeDay } from '@/lib/format';
import { useOnline } from '@/lib/network';
import { useSettingsStore } from '@/lib/settings';
import { useSyncStore } from '@/lib/sync/engine';
import { toast } from '@/lib/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { MonthSelector, StatTile } from '@/features/life/components';
import { computeFinanceSummary, inLocalMonth, localMonthKey } from '@/features/life/helpers';

type Filter = 'all' | 'expense' | 'income';

export default function FinanceOverview() {
  const router = useRouter();
  const { colors } = useTheme();
  const online = useOnline();
  const pending = useSyncStore((s) => s.pending);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const currency = useSettingsStore((s) => s.preferences.currency);
  const [month, setMonth] = useState(localMonthKey());
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [exporting, setExporting] = useState(false);

  const { data: transactions = [] } = useEntities('transaction');
  const { data: budgets = [] } = useEntities('budget');
  const { data: bills = [] } = useEntities('recurringPayment');
  const local = useMemo(() => computeFinanceSummary(transactions, budgets, bills, month, currency), [transactions, budgets, bills, month, currency]);

  // The server's view is used only when online and nothing local is waiting to sync,
  // otherwise it would be missing the newest entries. Keying on lastSyncedAt makes every
  // completed sync fetch a fresh summary, so a cached pre-edit total is never shown as synced.
  const server = useQuery({
    queryKey: ['finance-summary', month, currency, lastSyncedAt],
    queryFn: () => endpoints.finance.summary(month),
    enabled: online && pending === 0,
    retry: false,
  });
  const useServer = online && pending === 0 && !!server.data && server.data.currency === currency;
  const summary: FinanceSummary = useServer ? server.data! : local;

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions
      .filter((t) => inLocalMonth(t.occurredAt, month))
      .filter((t) => filter === 'all' || t.kind === filter)
      .filter((t) => !q || t.category.toLowerCase().includes(q) || (t.note ?? '').toLowerCase().includes(q))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }, [transactions, month, filter, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof list>();
    for (const t of list) {
      const key = formatDate(t.occurredAt, { day: 'numeric', month: 'short', year: 'numeric' });
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    return [...map.entries()];
  }, [list]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const csv = await endpoints.finance.exportCsv();
      const file = new File(Paths.cache, 'aura-transactions.csv');
      file.create({ overwrite: true });
      file.write(csv);
      if (!(await Sharing.isAvailableAsync())) {
        toast.error('Sharing is not available on this device');
        return;
      }
      await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export transactions' });
    } catch (e) {
      toast.error(isNetworkError(e) ? 'Export needs an internet connection (it includes your synced history).' : errorMessage(e, 'Export failed'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen
        header={
          <ScreenHeader
            title="Money"
            right={<IconButton icon="share-outline" label="Export transactions as CSV" onPress={() => void exportCsv()} disabled={exporting} />}
          />
        }
      >
        <MonthSelector month={month} onChange={setMonth} />
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          <StatTile label="Income" value={money(summary.incomeMinor, currency)} tone="success" />
          <StatTile label="Spent" value={money(summary.expenseMinor, currency)} />
          <StatTile label="Net" value={money(summary.netMinor, currency)} tone={summary.netMinor < 0 ? 'danger' : 'success'} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <Badge label={useServer ? 'Synced with cloud' : 'Computed on device'} tone={useServer ? 'success' : 'default'} />
          {summary.otherCurrencies.length ? (
            <Text variant="small" color="textMuted" style={{ flex: 1 }}>
              + entries in {summary.otherCurrencies.join(', ')} (not converted)
            </Text>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
          <Button title="Budgets" icon="pie-chart-outline" size="sm" variant="secondary" onPress={() => router.push('/finance/budgets')} />
          <Button title="Bills & subscriptions" icon="receipt-outline" size="sm" variant="secondary" onPress={() => router.push('/finance/bills')} />
        </View>

        {summary.byCategory.some((c) => c.budgetMinor != null) ? (
          <>
            <SectionHeader title="Budgets this month" />
            <Card style={{ gap: 12 }}>
              {summary.byCategory
                .filter((c) => c.budgetMinor != null)
                .map((c) => {
                  const ratio = c.spentMinor / (c.budgetMinor || 1);
                  return (
                    <View key={c.category} style={{ gap: 6 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text variant="caption">{c.category}</Text>
                        <Text variant="caption" color={ratio > 1 ? 'danger' : 'textMuted'}>
                          {ratio > 1 ? `Over by ${money(c.spentMinor - c.budgetMinor!, currency)}` : `${money(c.budgetMinor! - c.spentMinor, currency)} left`}
                        </Text>
                      </View>
                      <ProgressBar value={ratio} color={ratio > 1 ? colors.danger : ratio > 0.8 ? colors.warning : colors.success} label={`${c.category} budget`} />
                    </View>
                  );
                })}
            </Card>
          </>
        ) : null}

        <SectionHeader title="Transactions" />
        <ChipGroup
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'expense', label: 'Expenses' },
            { value: 'income', label: 'Income' },
          ]}
        />
        <View style={{ marginTop: 10 }}>
          <TextField icon="search-outline" placeholder="Search category or note" value={query} onChangeText={setQuery} accessibilityLabel="Search transactions" />
        </View>
        {grouped.length === 0 ? (
          <EmptyState compact icon="receipt-outline" title="No transactions" body={transactions.length ? 'Nothing matches this month and filter.' : 'Add your first income or expense.'} actionLabel="Add transaction" onAction={() => router.push('/finance/transaction/new')} />
        ) : (
          grouped.map(([day, items]) => (
            <View key={day} style={{ marginTop: 14 }}>
              <Text variant="small" color="textMuted" style={{ marginBottom: 6 }}>
                {relativeDay(items[0]!.occurredAt)}
              </Text>
              <Card padded={false} style={{ paddingHorizontal: 12 }}>
                {items.map((t, i) => (
                  <View key={t.id}>
                    {i > 0 ? <Divider /> : null}
                    <ListItem
                      icon={t.kind === 'income' ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
                      iconColor={t.kind === 'income' ? colors.success : colors.textMuted}
                      title={t.note || t.category}
                      subtitle={t.note ? t.category : undefined}
                      right={
                        <Text variant="caption" weight="600" color={t.kind === 'income' ? 'success' : 'text'}>
                          {t.kind === 'income' ? '+' : '−'}
                          {money(t.amountMinor, t.currency)}
                        </Text>
                      }
                      onPress={() => router.push(`/finance/transaction/${t.id}`)}
                    />
                  </View>
                ))}
              </Card>
            </View>
          ))
        )}

        <Text variant="small" color="textSubtle" align="center" style={{ marginTop: 24 }}>
          Manual tracking only — AURA never connects to your bank or moves money.
        </Text>
      </Screen>
      <Fab label="Add transaction" onPress={() => router.push('/finance/transaction/new')} bottom={32} />
    </View>
  );
}
