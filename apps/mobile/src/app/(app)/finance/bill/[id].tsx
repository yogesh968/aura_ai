import { useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DEFAULT_EXPENSE_CATEGORIES, parseMoneyInput, type RecurringPayment } from '@aura/shared';
import {
  Button,
  ChipGroup,
  DateTimeField,
  EmptyState,
  IconButton,
  LoadingState,
  Screen,
  ScreenHeader,
  Segmented,
  SelectRow,
  SelectSheet,
  Text,
  TextField,
  ToggleRow,
} from '@/components/ui';
import { useEntity } from '@/lib/data';
import { createEntity, deleteEntity, updateEntity, ValidationError } from '@/lib/db/repo';
import { relativeDay } from '@/lib/format';
import { useSettingsStore } from '@/lib/settings';
import { toast } from '@/lib/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { CurrencyAmountField, minorToInput } from '@/features/life/CurrencyAmountField';
import { markBillPaid } from '@/features/life/markBillPaid';

function defaultDue() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(9, 0, 0, 0);
  return d;
}

export default function BillEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const { data: bill, isLoading } = useEntity('recurringPayment', isNew ? undefined : id);

  if (!isNew && isLoading) {
    return (
      <Screen header={<ScreenHeader title="Bill" />}>
        <LoadingState />
      </Screen>
    );
  }
  if (!isNew && !bill) {
    return (
      <Screen header={<ScreenHeader title="Bill" />}>
        <EmptyState icon="alert-circle-outline" title="Bill not found" actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }
  return <BillForm key={id} id={id} bill={bill ?? null} />;
}

function BillForm({ id, bill }: { id: string; bill: RecurringPayment | null }) {
  const isNew = bill === null;
  const router = useRouter();
  const { colors } = useTheme();
  const prefCurrency = useSettingsStore((s) => s.preferences.currency);

  const [name, setName] = useState(bill?.name ?? '');
  const [kind, setKind] = useState<RecurringPayment['kind']>(bill?.kind ?? 'bill');
  const [amount, setAmount] = useState(bill ? minorToInput(bill.amountMinor, bill.currency) : '');
  const [currency, setCurrency] = useState(bill?.currency ?? prefCurrency);
  const [category, setCategory] = useState(bill?.category ?? 'Bills & Utilities');
  const [frequency, setFrequency] = useState<RecurringPayment['frequency']>(bill?.frequency ?? 'monthly');
  const [due, setDue] = useState<Date>(bill ? new Date(bill.nextDueAt) : defaultDue());
  const [remindDays, setRemindDays] = useState(bill?.remindDaysBefore ?? 2);
  const [active, setActive] = useState(bill?.active ?? true);
  const [catOpen, setCatOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const amountMinor = parseMoneyInput(amount, currency);
    if (amountMinor == null) {
      setErrors({ amountMinor: 'Enter an amount greater than zero' });
      return;
    }
    const input = { name: name.trim(), kind, amountMinor, currency, category, frequency, nextDueAt: due.toISOString(), remindDaysBefore: remindDays, active };
    setSaving(true);
    try {
      if (isNew) await createEntity('recurringPayment', input);
      else await updateEntity('recurringPayment', id, input);
      toast.success(isNew ? `${kind === 'bill' ? 'Bill' : 'Subscription'} added` : 'Saved');
      router.back();
    } catch (e) {
      if (e instanceof ValidationError) setErrors(e.fields);
      else toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    Alert.alert('Delete?', `“${name}” and its reminders will be removed. Past payments stay in your transactions.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteEntity('recurringPayment', id);
            toast.success('Deleted');
            router.back();
          } catch {
            toast.error('Could not delete this bill');
          }
        },
      },
    ]);

  // Guarded so a double tap can't record the same payment twice.
  const payingRef = useRef(false);
  const [paying, setPaying] = useState(false);
  const recordPayment = async () => {
    if (!bill || payingRef.current) return;
    payingRef.current = true;
    setPaying(true);
    try {
      const { nextDueAt } = await markBillPaid(bill);
      setDue(new Date(nextDueAt));
      toast.success(`Payment recorded · next due ${relativeDay(nextDueAt)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not record payment');
    } finally {
      payingRef.current = false;
      setPaying(false);
    }
  };
  const pay = () => {
    if (!bill) return;
    Alert.alert('Mark as paid?', `Records an expense for “${bill.name}” and moves the next due date forward.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark paid', onPress: () => void recordPayment() },
    ]);
  };

  return (
    <Screen
      header={<ScreenHeader title={isNew ? 'New bill' : 'Edit bill'} right={!isNew ? <IconButton icon="trash-outline" label="Delete bill" color={colors.danger} onPress={remove} /> : null} />}
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
            if (k === 'subscription' && category === 'Bills & Utilities') setCategory('Subscriptions');
            if (k === 'bill' && category === 'Subscriptions') setCategory('Bills & Utilities');
          }}
          options={[
            { value: 'bill', label: 'Bill' },
            { value: 'subscription', label: 'Subscription' },
          ]}
        />
        <TextField label="Name" placeholder={kind === 'bill' ? 'e.g. Electricity' : 'e.g. Netflix'} value={name} onChangeText={setName} error={errors.name} autoFocus={isNew} maxLength={200} />
        <CurrencyAmountField value={amount} onChange={setAmount} currency={currency} onCurrencyChange={setCurrency} error={errors.amountMinor} />
        <View style={{ gap: 8 }}>
          <Text variant="small" color="textMuted">
            Repeats
          </Text>
          <ChipGroup
            value={frequency}
            onChange={setFrequency}
            options={[
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
              { value: 'yearly', label: 'Yearly' },
            ]}
          />
        </View>
        <DateTimeField label="Next due" mode="date" value={due} onChange={(d) => d && setDue(d)} clearable={false} />
        <SelectRow label="Category" value={category} onPress={() => setCatOpen(true)} icon="pricetag-outline" />
        <View style={{ gap: 8 }}>
          <Text variant="small" color="textMuted">
            Remind me
          </Text>
          <ChipGroup
            value={String(remindDays)}
            onChange={(v) => setRemindDays(Number(v))}
            options={[
              { value: '0', label: 'On the day' },
              { value: '1', label: '1 day before' },
              { value: '2', label: '2 days before' },
              { value: '5', label: '5 days before' },
              { value: '7', label: '1 week before' },
            ]}
          />
        </View>
        <ToggleRow label="Active" description="Paused bills don't send reminders" value={active} onChange={setActive} icon="notifications-outline" />
        {!isNew && bill?.active ? <Button title="Mark as paid" icon="checkmark-done-outline" variant="secondary" onPress={pay} loading={paying} disabled={paying} /> : null}
      </View>
      <SelectSheet
        visible={catOpen}
        onClose={() => setCatOpen(false)}
        title="Category"
        value={category}
        onSelect={setCategory}
        options={[...new Set([...DEFAULT_EXPENSE_CATEGORIES, category])].map((c) => ({ value: c, label: c }))}
      />
    </Screen>
  );
}
