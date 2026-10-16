import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  parseMoneyInput,
  type Transaction,
} from '@aura/shared';
import {
  Button,
  Chip,
  DateTimeField,
  EmptyState,
  IconButton,
  LoadingState,
  Screen,
  ScreenHeader,
  Segmented,
  Text,
  TextField,
} from '@/components/ui';
import { useEntities, useEntity } from '@/lib/data';
import { createEntity, deleteEntity, restoreEntity, updateEntity, ValidationError } from '@/lib/db/repo';
import { useSettingsStore } from '@/lib/settings';
import { toast } from '@/lib/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { CurrencyAmountField, minorToInput } from '@/features/life/CurrencyAmountField';

export default function TransactionEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const { data: tx, isLoading } = useEntity('transaction', isNew ? undefined : id);

  if (!isNew && isLoading) {
    return (
      <Screen header={<ScreenHeader title="Transaction" />}>
        <LoadingState />
      </Screen>
    );
  }
  if (!isNew && !tx) {
    return (
      <Screen header={<ScreenHeader title="Transaction" />}>
        <EmptyState icon="alert-circle-outline" title="Transaction not found" actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }
  return <TransactionForm key={id} id={id} tx={tx ?? null} />;
}

function TransactionForm({ id, tx }: { id: string; tx: Transaction | null }) {
  const isNew = tx === null;
  const router = useRouter();
  const { colors } = useTheme();
  const prefCurrency = useSettingsStore((s) => s.preferences.currency);
  const { data: all = [] } = useEntities('transaction');

  const [kind, setKind] = useState<Transaction['kind']>(tx?.kind ?? 'expense');
  const [amount, setAmount] = useState(tx ? minorToInput(tx.amountMinor, tx.currency) : '');
  const [currency, setCurrency] = useState(tx?.currency ?? prefCurrency);
  const [category, setCategory] = useState<string>(tx?.category ?? '');
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState(tx?.note ?? '');
  const [date, setDate] = useState<Date>(tx ? new Date(tx.occurredAt) : new Date());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Defaults plus categories the user has used before.
  const categories = useMemo(() => {
    const base: string[] = kind === 'expense' ? [...DEFAULT_EXPENSE_CATEGORIES] : [...DEFAULT_INCOME_CATEGORIES];
    const used = all.filter((t) => t.kind === kind).map((t) => t.category);
    return [...new Set([...base, ...used, ...(category ? [category] : [])])];
  }, [kind, all, category]);

  const save = async () => {
    const amountMinor = parseMoneyInput(amount, currency);
    const finalCategory = custom.trim() || category;
    const next: Record<string, string> = {};
    if (amountMinor == null) next.amountMinor = 'Enter an amount greater than zero';
    if (!finalCategory) next.category = 'Choose a category';
    setErrors(next);
    if (Object.keys(next).length) return;
    const input = { kind, amountMinor: amountMinor!, currency, category: finalCategory, note: note.trim() || null, occurredAt: date.toISOString() };
    setSaving(true);
    try {
      if (isNew) await createEntity('transaction', input);
      else await updateEntity('transaction', id, input);
      toast.success(isNew ? `${kind === 'income' ? 'Income' : 'Expense'} added` : 'Saved');
      router.back();
    } catch (e) {
      if (e instanceof ValidationError) setErrors(e.fields);
      else toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    Alert.alert('Delete transaction?', 'This entry will be removed from your records.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const snapshot = tx!;
          try {
            await deleteEntity('transaction', id);
            toast.success('Transaction deleted', {
              label: 'Undo',
              onPress: () => void restoreEntity('transaction', snapshot).catch(() => toast.error('Could not restore the transaction')),
            });
            router.back();
          } catch {
            toast.error('Could not delete the transaction');
          }
        },
      },
    ]);

  return (
    <Screen
      header={<ScreenHeader title={isNew ? 'Add transaction' : 'Edit transaction'} right={!isNew ? <IconButton icon="trash-outline" label="Delete transaction" color={colors.danger} onPress={remove} /> : null} />}
      footer={
        <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
          <Button title="Save" onPress={() => void save()} loading={saving} fullWidth />
        </View>
      }
    >
      <View style={{ gap: 16 }}>
        <Segmented
          value={kind}
          onChange={(k) => {
            setKind(k);
            setCategory('');
          }}
          options={[
            { value: 'expense', label: 'Expense' },
            { value: 'income', label: 'Income' },
          ]}
        />
        <CurrencyAmountField value={amount} onChange={setAmount} currency={currency} onCurrencyChange={setCurrency} error={errors.amountMinor} autoFocus={isNew} />
        {currency !== prefCurrency ? (
          <Text variant="small" color="textMuted">
            Recorded in {currency}. Totals in {prefCurrency} won’t include it — AURA never guesses exchange rates.
          </Text>
        ) : null}
        <View style={{ gap: 8 }}>
          <Text variant="small" color="textMuted">
            Category
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {categories.map((c) => (
              <Chip
                key={c}
                label={c}
                selected={!custom.trim() && c === category}
                onPress={() => {
                  setCategory(c);
                  setCustom('');
                }}
              />
            ))}
          </View>
          <TextField placeholder="Or type a new category" value={custom} onChangeText={setCustom} maxLength={60} accessibilityLabel="Custom category" />
          {errors.category ? (
            <Text variant="small" color="danger">
              {errors.category}
            </Text>
          ) : null}
        </View>
        <DateTimeField label="When" value={date} onChange={(d) => d && setDate(d)} clearable={false} />
        <TextField label="Note (optional)" placeholder="e.g. Dinner with friends" value={note} onChangeText={setNote} maxLength={500} />
      </View>
    </Screen>
  );
}
