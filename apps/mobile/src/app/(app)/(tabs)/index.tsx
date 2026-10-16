import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import { localDateKey } from '@aura/shared';
import {
  Card,
  EmptyState,
  GradientCard,
  Icon,
  IconButton,
  ProgressRing,
  Screen,
  SectionHeader,
  Text,
  type IconName,
} from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuthStore } from '@/lib/auth/store';
import { endpoints } from '@/lib/api/endpoints';
import { useEntities } from '@/lib/data';
import { formatDate, greeting, money, relativeDay } from '@/lib/format';
import { useOnline } from '@/lib/network';
import { useSettingsStore } from '@/lib/settings';
import { syncNow } from '@/lib/sync/engine';
import { EventRow, QuickAddBar, ReminderRow, SyncChip, TaskRow } from '@/features/planner/components';
import { addDays, buildDayAgenda } from '@/features/planner/logic';

interface QuickAction {
  icon: IconName;
  label: string;
  href: string;
}

export default function HomeScreen() {
  const router = useRouter();
  const { colors, radius } = useTheme();
  const user = useAuthStore((s) => s.user);
  const prefs = useSettingsStore((s) => s.preferences);
  const online = useOnline();
  const [refreshing, setRefreshing] = useState(false);

  const tasks = useEntities('task');
  const events = useEntities('event');
  const reminders = useEntities('reminder');
  const habits = useEntities('habit');
  const habitLogs = useEntities('habitLog');
  const wellness = useEntities('wellness');
  const bills = useEntities('recurringPayment');

  const pending = useQuery({
    queryKey: ['actions', 'pending'],
    queryFn: () => endpoints.actions.list('pending'),
    enabled: online,
    refetchInterval: 60_000,
  });

  const now = new Date();
  const todayKey = localDateKey(now);
  // The React Compiler memoizes these derived values automatically.
  const agenda = buildDayAgenda(now, { tasks: tasks.data ?? [], events: events.data ?? [], reminders: reminders.data ?? [] });

  const todayLogs = (habitLogs.data ?? []).filter((l) => l.date === todayKey);
  const habitCards = (habits.data ?? [])
    .filter((h) => !h.archived && h.frequency === 'daily')
    .slice(0, 3)
    .map((h) => ({ habit: h, progress: todayLogs.filter((l) => l.habitId === h.id).reduce((sum, l) => sum + l.value, 0) }));

  const waterToday = (wellness.data ?? []).filter((w) => w.metric === 'water' && w.date === todayKey).reduce((sum, w) => sum + w.value, 0);

  const billLimit = addDays(now, 7);
  const dueBills = (bills.data ?? [])
    .filter((b) => b.active && new Date(b.nextDueAt) <= billLimit)
    .sort((a, b) => a.nextDueAt.localeCompare(b.nextDueAt));

  const evening = now.getHours() >= 17;
  const actions: QuickAction[] = [
    { icon: 'checkbox-outline', label: 'New task', href: '/task/new' },
    { icon: 'alarm-outline', label: 'Reminder', href: '/reminder/new' },
    { icon: 'create-outline', label: 'Note', href: '/notes/new' },
    { icon: 'wallet-outline', label: 'Expense', href: '/finance/transaction/new' },
    { icon: 'sparkles-outline', label: 'Plan my day', href: `/chat/new?prompt=${encodeURIComponent('Plan my day')}` },
    { icon: evening ? 'moon-outline' : 'sunny-outline', label: evening ? 'Evening recap' : 'Briefing', href: `/briefing?kind=${evening ? 'evening' : 'morning'}` },
  ];

  const loading = tasks.isLoading || events.isLoading || reminders.isLoading;
  const empty = !loading && agenda.events.length + agenda.tasksDue.length + agenda.overdue.length + agenda.reminders.length === 0;
  const pendingCount = pending.data?.length ?? 0;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await syncNow();
      if (online) await pending.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Screen tabBarInset refreshing={refreshing} onRefresh={() => void refresh()}>
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Text variant="caption" color="textMuted">
            {formatDate(now, { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
          <Text variant="title" accessibilityRole="header">
            {greeting(user?.isGuest ? null : user?.name)}
          </Text>
        </View>
        <IconButton icon="notifications-outline" label="Notifications inbox" onPress={() => router.push('/inbox')} />
      </View>
      <SyncChip />

      <Animated.View entering={FadeInDown.duration(250)} style={{ marginTop: 16 }}>
        <GradientCard onPress={() => router.push('/chat/new')} accessibilityLabel={`Ask ${prefs.assistantName}`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text variant="overline" style={{ color: 'rgba(255,255,255,0.85)' }}>
                {prefs.assistantName}
              </Text>
              <Text variant="heading" style={{ color: '#FFFFFF', marginTop: 4 }}>
                How can I help today?
              </Text>
              <Text variant="caption" style={{ color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>
                Plan, remember, research, write — just ask.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Talk to Aura"
              onPress={() => router.push('/voice')}
              style={({ pressed }) => [styles.mic, { backgroundColor: pressed ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.22)' }]}
            >
              <Icon name="mic" size={26} color="#FFFFFF" />
            </Pressable>
          </View>
        </GradientCard>
      </Animated.View>

      <View style={{ marginTop: 16 }}>
        <QuickAddBar />
      </View>

      {pendingCount > 0 ? (
        <Card tone="warning" onPress={() => router.push('/actions')} style={{ marginTop: 16 }} accessibilityLabel={`${pendingCount} actions waiting for your confirmation`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name="shield-checkmark-outline" size={22} color="warning" />
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {pendingCount === 1 ? '1 action needs your confirmation' : `${pendingCount} actions need your confirmation`}
            </Text>
            <Icon name="chevron-forward" size={18} color="textMuted" />
          </View>
        </Card>
      ) : null}

      <SectionHeader title="Today" action="Open planner" onAction={() => router.push('/plan')} />
      <Card padded={false} style={{ paddingHorizontal: 12, paddingVertical: 4 }}>
        {loading ? (
          <Text variant="caption" color="textMuted" style={{ padding: 16 }}>
            Loading your day…
          </Text>
        ) : empty ? (
          <EmptyState compact icon="sunny-outline" title="Nothing scheduled today" body="Use quick add above or ask Aura to plan your day." />
        ) : (
          <>
            {agenda.events.map((e) => (
              <EventRow key={`e-${e.event.id}`} event={e.event} start={e.start} />
            ))}
            {agenda.reminders.map((r) => (
              <ReminderRow key={`r-${r.reminder.id}`} reminder={r.reminder} at={r.at} />
            ))}
            {agenda.tasksDue.map((t) => (
              <TaskRow key={`t-${t.id}`} task={t} showDate={false} />
            ))}
            {agenda.overdue.length > 0 ? (
              <>
                <Text variant="overline" color="danger" style={{ marginTop: 10, marginLeft: 4 }}>
                  Overdue
                </Text>
                {agenda.overdue.slice(0, 5).map((t) => (
                  <TaskRow key={`o-${t.id}`} task={t} />
                ))}
                {agenda.overdue.length > 5 ? (
                  <Pressable accessibilityRole="button" onPress={() => router.push('/plan')} style={{ padding: 10 }}>
                    <Text variant="caption" color="primary">{`+${agenda.overdue.length - 5} more overdue`}</Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </Card>

      <SectionHeader title="Quick actions" />
      <View style={styles.grid}>
        {actions.map((a) => (
          <Pressable
            key={a.label}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            onPress={() => router.push(a.href as never)}
            style={({ pressed }) => [styles.action, { backgroundColor: pressed ? colors.surfacePressed : colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}
          >
            <View style={[styles.actionIcon, { backgroundColor: colors.primarySoft }]}>
              <Icon name={a.icon} size={20} color="primary" />
            </View>
            <Text variant="small" align="center" numberOfLines={1}>
              {a.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <SectionHeader title="Wellness" action="Open" onAction={() => router.push('/life')} />
      <View style={styles.row}>
        <Card style={styles.mini} onPress={() => router.push('/wellness/water')} accessibilityLabel={`Water ${waterToday} of ${prefs.wellnessTargets.waterMl} millilitres`}>
          <ProgressRing value={prefs.wellnessTargets.waterMl ? waterToday / prefs.wellnessTargets.waterMl : 0} size={56} color={colors.categorical[1]}>
            <Icon name="water-outline" size={20} color={colors.categorical[1]} />
          </ProgressRing>
          <Text variant="small" color="textMuted" style={{ marginTop: 8 }}>
            Water
          </Text>
          <Text variant="caption" weight="600">{`${(waterToday / 1000).toFixed(1)} / ${(prefs.wellnessTargets.waterMl / 1000).toFixed(1)} L`}</Text>
        </Card>
        {habitCards.map(({ habit, progress }, i) => (
          <Card key={habit.id} style={styles.mini} onPress={() => router.push(`/habits/${habit.id}`)} accessibilityLabel={`${habit.name} ${progress} of ${habit.target}`}>
            <ProgressRing value={habit.target ? progress / habit.target : 0} size={56} color={habit.color ?? colors.categorical[(i + 2) % colors.categorical.length]}>
              <Text variant="small" weight="700">{`${Math.round(Math.min(1, progress / (habit.target || 1)) * 100)}%`}</Text>
            </ProgressRing>
            <Text variant="small" color="textMuted" numberOfLines={1} style={{ marginTop: 8 }}>
              {habit.name}
            </Text>
            <Text variant="caption" weight="600">{`${progress}/${habit.target}${habit.unit ? ` ${habit.unit}` : ''}`}</Text>
          </Card>
        ))}
        {habitCards.length === 0 ? (
          <Card style={[styles.mini, { justifyContent: 'center' }]} onPress={() => router.push('/habits/new')} accessibilityLabel="Start a habit">
            <Icon name="add-circle-outline" size={28} color="primary" />
            <Text variant="small" color="textMuted" style={{ marginTop: 8 }}>
              Start a habit
            </Text>
          </Card>
        ) : null}
      </View>

      {dueBills.length > 0 ? (
        <>
          <SectionHeader title="Bills this week" action="Finance" onAction={() => router.push('/finance')} />
          <Card padded={false} style={{ paddingHorizontal: 12, paddingVertical: 4 }}>
            {dueBills.map((b) => {
              const overdue = new Date(b.nextDueAt) < now;
              return (
                <Pressable key={b.id} accessibilityRole="button" onPress={() => router.push(`/finance/bill/${b.id}`)} style={styles.bill}>
                  <Icon name={b.kind === 'subscription' ? 'repeat-outline' : 'receipt-outline'} size={20} color={overdue ? 'danger' : 'textMuted'} />
                  <View style={{ flex: 1 }}>
                    <Text variant="body">{b.name}</Text>
                    <Text variant="small" color={overdue ? 'danger' : 'textMuted'}>
                      {overdue ? `Overdue since ${relativeDay(b.nextDueAt)}` : `Due ${relativeDay(b.nextDueAt)}`}
                    </Text>
                  </View>
                  <Text variant="bodyStrong">{money(b.amountMinor, b.currency)}</Text>
                </Pressable>
              );
            })}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 8 },
  mic: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  action: { width: '31%', flexGrow: 1, alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 6, borderWidth: StyleSheet.hairlineWidth },
  actionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 10 },
  mini: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  bill: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
});
