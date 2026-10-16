import { useMemo } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { RecurringPayment } from '@aura/shared';
import { Badge, Button, Card, EmptyState, Fab, Screen, ScreenHeader, SectionHeader, Text } from '@/components/ui';
import { useEntities } from '@/lib/data';
import { money, relativeDay } from '@/lib/format';
import { useSettingsStore } from '@/lib/settings';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { markBillPaid } from '@/features/life/markBillPaid';

const PER_MONTH = { weekly: 52 / 12, monthly: 1, yearly: 1 / 12 } as const;

export default function BillsScreen() {
  const router = useRouter();
  const currency = useSettingsStore((s) => s.preferences.currency);
  const { data: bills = [] } = useEntities('recurringPayment');
  const sorted = useMemo(() => [...bills].sort((a, b) => Number(b.active) - Number(a.active) || a.nextDueAt.localeCompare(b.nextDueAt)), [bills]);
  const monthly = bills
    .filter((b) => b.active && b.currency === currency)
    .reduce((s, b) => s + b.amountMinor * PER_MONTH[b.frequency], 0);
  const subs = sorted.filter((b) => b.kind === 'subscription');
  const regular = sorted.filter((b) => b.kind === 'bill');

  const pay = (b: RecurringPayment) =>
    Alert.alert('Mark as paid?', `Records an expense of ${money(b.amountMinor, b.currency)} for ${b.name} and moves the due date to the next ${b.frequency.replace('ly', '')}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark paid',
        onPress: async () => {
          try {
            const { nextDueAt } = await markBillPaid(b);
            haptics.success();
            toast.success(`${b.name} paid · next due ${relativeDay(nextDueAt)}`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not record payment');
          }
        },
      },
    ]);

  const renderBill = (b: RecurringPayment) => {
    const overdue = b.active && new Date(b.nextDueAt) < new Date();
    return (
      <Card key={b.id} onPress={() => router.push(`/finance/bill/${b.id}`)} accessibilityLabel={`${b.name}, ${money(b.amountMinor, b.currency)}, due ${relativeDay(b.nextDueAt)}. Edit`} style={{ gap: 8, opacity: b.active ? 1 : 0.6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="subheading" style={{ flex: 1 }} numberOfLines={1}>
            {b.name}
          </Text>
          <Text variant="subheading">{money(b.amountMinor, b.currency)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Badge label={b.active ? (overdue ? `Overdue · ${relativeDay(b.nextDueAt)}` : `Due ${relativeDay(b.nextDueAt)}`) : 'Paused'} tone={overdue ? 'danger' : b.active ? 'primary' : 'default'} />
          <Text variant="small" color="textMuted" style={{ flex: 1 }}>
            {b.frequency} · {b.category}
          </Text>
          {b.active ? <Button title="Paid" size="sm" variant="soft" icon="checkmark" onPress={() => pay(b)} accessibilityLabel={`Mark ${b.name} as paid`} /> : null}
        </View>
      </Card>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen header={<ScreenHeader title="Bills & subscriptions" subtitle={bills.length ? `≈ ${money(Math.round(monthly), currency)} per month` : undefined} />}>
        {bills.length === 0 ? (
          <EmptyState icon="receipt-outline" title="No bills tracked" body="Add rent, utilities and subscriptions to get reminders before they're due." actionLabel="Add bill" onAction={() => router.push('/finance/bill/new')} />
        ) : null}
        {regular.length ? <SectionHeader title="Bills" /> : null}
        <View style={{ gap: 10 }}>{regular.map(renderBill)}</View>
        {subs.length ? <SectionHeader title="Subscriptions" /> : null}
        <View style={{ gap: 10 }}>{subs.map(renderBill)}</View>
        {bills.length ? (
          <Text variant="small" color="textSubtle" align="center" style={{ marginTop: 20 }}>
            Reminders arrive on this phone before each due date. AURA never pays bills for you.
          </Text>
        ) : null}
      </Screen>
      <Fab label="Add bill or subscription" onPress={() => router.push('/finance/bill/new')} bottom={32} />
    </View>
  );
}
