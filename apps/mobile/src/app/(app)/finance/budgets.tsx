import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { DEFAULT_EXPENSE_CATEGORIES, parseMoneyInput, type Budget } from '@aura/shared';
import { Button, Card, Chip, EmptyState, IconButton, ProgressBar, Screen, ScreenHeader, Sheet, Text, TextField } from '@/components/ui';
import { useEntities } from '@/lib/data';
import { createEntity, deleteEntity, updateEntity } from '@/lib/db/repo';
import { money } from '@/lib/format';
import { useSettingsStore } from '@/lib/settings';
import { toast } from '@/lib/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { CurrencyAmountField, minorToInput } from '@/features/life/CurrencyAmountField';
import { computeFinanceSummary, localMonthKey, monthLabel } from '@/features/life/helpers';

export default function BudgetsScreen() {
  const { colors } = useTheme();
  const currency = useSettingsStore((s) => s.preferences.currency);
  const { data: budgets = [] } = useEntities('budget');
  const { data: transactions = [] } = useEntities('transaction');
  const [editing, setEditing] = useState<Budget | 'new' | null>(null);
  const month = localMonthKey();
  const summary = useMemo(() => computeFinanceSummary(transactions, budgets, [], month, currency), [transactions, budgets, month, currency]);
  const spent = (category: string) => summary.byCategory.find((c) => c.category === category)?.spentMinor ?? 0;
  const list = [...budgets].sort((a, b) => a.category.localeCompare(b.category));
  const totalLimit = list.filter((b) => b.currency === currency).reduce((s, b) => s + b.limitMinor, 0);
  const totalSpent = list.filter((b) => b.currency === currency).reduce((s, b) => s + spent(b.category), 0);

  const remove = (b: Budget) =>
    Alert.alert('Delete budget?', `${b.category} budget will be removed. Transactions are kept.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteEntity('budget', b.id).then(() => toast.success('Budget deleted'), () => toast.error('Could not delete the budget')) },
    ]);

  return (
    <Screen header={<ScreenHeader title="Budgets" subtitle={`Monthly limits · ${monthLabel(month)}`} right={<IconButton icon="add" label="Add budget" onPress={() => setEditing('new')} />} />}>
      {list.length === 0 ? (
        <EmptyState icon="pie-chart-outline" title="No budgets yet" body="Set a monthly limit for a category and see how much is left as you spend." actionLabel="Add budget" onAction={() => setEditing('new')} />
      ) : (
        <>
          <Card tone="primary" style={{ gap: 8, marginBottom: 16 }}>
            <Text variant="caption" color="textMuted">
              Total this month
            </Text>
            <Text variant="title">
              {money(totalSpent, currency)} <Text variant="body" color="textMuted">of {money(totalLimit, currency)}</Text>
            </Text>
            <ProgressBar value={totalLimit ? totalSpent / totalLimit : 0} color={totalSpent > totalLimit ? colors.danger : colors.primary} label="Total budget used" />
          </Card>
          <View style={{ gap: 12 }}>
            {list.map((b) => {
              const s = b.currency === currency ? spent(b.category) : 0;
              const ratio = s / b.limitMinor;
              return (
                <Card key={b.id} onPress={() => setEditing(b)} accessibilityLabel={`${b.category} budget. Edit`} style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text variant="subheading" style={{ flex: 1 }}>
                      {b.category}
                    </Text>
                    <IconButton icon="trash-outline" label={`Delete ${b.category} budget`} size={18} color={colors.textSubtle} onPress={() => remove(b)} />
                  </View>
                  <ProgressBar value={ratio} color={ratio > 1 ? colors.danger : ratio > 0.8 ? colors.warning : colors.success} label={`${b.category} budget used`} />
                  <Text variant="small" color={ratio > 1 ? 'danger' : 'textMuted'}>
                    {b.currency !== currency
                      ? `Limit ${money(b.limitMinor, b.currency)} (spending in ${b.currency} isn't tracked against ${currency})`
                      : `${money(s, currency)} of ${money(b.limitMinor, currency)}${ratio > 1 ? ` · over by ${money(s - b.limitMinor, currency)}` : ` · ${money(b.limitMinor - s, currency)} left`}`}
                  </Text>
                </Card>
              );
            })}
          </View>
        </>
      )}
      {editing ? <BudgetSheet key={editing === 'new' ? 'new' : editing.id} budget={editing === 'new' ? null : editing} existing={budgets} currency={currency} onClose={() => setEditing(null)} /> : null}
    </Screen>
  );
}

function BudgetSheet({ budget, existing, currency, onClose }: { budget: Budget | null; existing: Budget[]; currency: string; onClose: () => void }) {
  const [category, setCategory] = useState(budget?.category ?? '');
  const [amount, setAmount] = useState(budget ? minorToInput(budget.limitMinor, budget.currency) : '');
  const [error, setError] = useState<string | null>(null);
  const cur = budget?.currency ?? currency;
  const taken = new Set(existing.filter((b) => b.id !== budget?.id).map((b) => b.category.toLowerCase()));

  const save = async () => {
    const limitMinor = parseMoneyInput(amount, cur);
    if (!category.trim()) return setError('Choose a category');
    if (taken.has(category.trim().toLowerCase())) return setError('There is already a budget for this category');
    if (limitMinor == null) return setError('Enter a limit greater than zero');
    try {
      if (budget) await updateEntity('budget', budget.id, { category: category.trim(), limitMinor });
      else await createEntity('budget', { category: category.trim(), limitMinor, currency: cur, period: 'monthly' });
      toast.success('Budget saved');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    }
  };

  return (
    <Sheet visible onClose={onClose} title={budget ? 'Edit budget' : 'New budget'} footer={<Button title="Save" onPress={() => void save()} fullWidth />}>
      <View style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {DEFAULT_EXPENSE_CATEGORIES.filter((c) => !taken.has(c.toLowerCase())).map((c) => (
            <Chip key={c} label={c} selected={c === category} onPress={() => setCategory(c)} />
          ))}
        </View>
        <TextField label="Category" value={category} onChangeText={setCategory} maxLength={60} />
        <CurrencyAmountField label="Monthly limit" value={amount} onChange={setAmount} currency={cur} />
        {error ? (
          <Text variant="small" color="danger">
            {error}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}
