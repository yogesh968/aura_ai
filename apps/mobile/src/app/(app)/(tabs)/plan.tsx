import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { localDateKey, type RescheduleSuggestion, type Task } from '@aura/shared';
import {
  Badge,
  Button,
  Card,
  ChipGroup,
  EmptyState,
  Fab,
  Icon,
  ListItem,
  LoadingState,
  Screen,
  SectionHeader,
  Segmented,
  Text,
} from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { endpoints } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/client';
import { useEntities } from '@/lib/data';
import { updateEntity } from '@/lib/db/repo';
import { formatDateTime, formatTime, relativeDay } from '@/lib/format';
import { useOnline } from '@/lib/network';
import { useSettingsStore } from '@/lib/settings';
import { syncNow } from '@/lib/sync/engine';
import { toast } from '@/lib/toast';
import { EventRow, MonthCalendar, ReminderRow, TaskRow } from '@/features/planner/components';
import { listPhoneEvents } from '@/features/planner/deviceCalendar';
import {
  buildDayAgenda,
  busyDayKeys,
  filterTasks,
  groupTasksByDay,
  tomorrowAt9,
  upcomingReminders,
  type TaskFilter,
} from '@/features/planner/logic';

type Segment = 'tasks' | 'calendar' | 'reminders';

const FILTERS: { value: TaskFilter; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'all', label: 'All open' },
  { value: 'done', label: 'Done' },
];

export default function PlanScreen() {
  const router = useRouter();
  const [segment, setSegment] = useState<Segment>('tasks');
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await syncNow();
    } finally {
      setRefreshing(false);
    }
  };

  const fab =
    segment === 'tasks'
      ? { label: 'New task', href: '/task/new' }
      : segment === 'calendar'
        ? { label: 'New event', href: '/event/new' }
        : { label: 'New reminder', href: '/reminder/new' };

  return (
    <View style={{ flex: 1 }}>
      <Screen tabBarInset refreshing={refreshing} onRefresh={() => void refresh()}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 12 }}>
          <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
            Plan
          </Text>
          <Button title="Projects" icon="folder-outline" size="sm" variant="soft" onPress={() => router.push('/projects')} />
        </View>
        <Segmented
          value={segment}
          onChange={setSegment}
          options={[
            { value: 'tasks', label: 'Tasks' },
            { value: 'calendar', label: 'Calendar' },
            { value: 'reminders', label: 'Reminders' },
          ]}
        />
        <View style={{ marginTop: 16 }}>
          {segment === 'tasks' ? <TasksSection /> : segment === 'calendar' ? <CalendarSection /> : <RemindersSection />}
        </View>
      </Screen>
      <Fab label={fab.label} onPress={() => router.push(fab.href as never)} />
    </View>
  );
}

function TasksSection() {
  const router = useRouter();
  const tasks = useEntities('task');
  const [filter, setFilter] = useState<TaskFilter>('today');
  const list = useMemo(() => filterTasks(tasks.data ?? [], filter), [tasks.data, filter]);
  const groups = useMemo(() => groupTasksByDay(list, relativeDay), [list]);
  const overdue = useMemo(() => filterTasks(tasks.data ?? [], 'overdue'), [tasks.data]);

  if (tasks.isLoading) return <LoadingState compact label="Loading tasks…" />;

  return (
    <View>
      <ChipGroup options={FILTERS} value={filter} onChange={setFilter} />
      {overdue.length > 0 && filter !== 'done' ? <RescheduleCard overdue={overdue} /> : null}
      {list.length === 0 ? (
        <EmptyState
          icon={filter === 'done' ? 'trophy-outline' : 'checkmark-done-outline'}
          title={filter === 'done' ? 'No completed tasks yet' : filter === 'overdue' ? 'Nothing overdue' : 'All clear'}
          body={filter === 'today' ? 'Nothing due today. Add a task or plan ahead.' : undefined}
          actionLabel={filter === 'done' ? undefined : 'Add task'}
          onAction={() => router.push('/task/new')}
        />
      ) : (
        groups.map((g) => (
          <View key={g.key}>
            <SectionHeader title={`${g.title} · ${g.tasks.length}`} />
            <Card padded={false} style={{ paddingHorizontal: 12, paddingVertical: 2 }}>
              {g.tasks.map((t) => (
                <TaskRow key={t.id} task={t} showDate={g.key === '0-overdue' || g.key === 'zz-none'} />
              ))}
            </Card>
          </View>
        ))
      )}
    </View>
  );
}

/**
 * Missed-task rescheduling: server suggestions use free slots around the
 * agenda (online); offline the fallback is "tomorrow at 9 AM".
 */
function RescheduleCard({ overdue }: { overdue: Task[] }) {
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const suggestions = useQuery({
    queryKey: ['planner', 'reschedule', overdue.map((t) => `${t.id}:${t.version}`).join(',')],
    queryFn: () => endpoints.planner.reschedule(),
    enabled: open && online,
  });

  const apply = async (s: RescheduleSuggestion) => {
    try {
      await updateEntity('task', s.taskId, { dueAt: s.suggestedDueAt });
      return true;
    } catch (e) {
      toast.error(errorMessage(e, `Couldn't move “${s.title}”`));
      return false;
    }
  };
  const applyAll = async (list: RescheduleSuggestion[]) => {
    let ok = 0;
    for (const s of list) if (await apply(s)) ok++;
    if (ok) toast.success(`Rescheduled ${ok} task${ok === 1 ? '' : 's'}`);
  };
  const moveAllTomorrow = async () => {
    const at = tomorrowAt9().toISOString();
    let ok = 0;
    for (const t of overdue) {
      try {
        await updateEntity('task', t.id, { dueAt: at });
        ok++;
      } catch (e) {
        toast.error(errorMessage(e));
      }
    }
    if (ok) toast.success(`Moved ${ok} task${ok === 1 ? '' : 's'} to tomorrow 9 AM`);
  };

  return (
    <Card tone="warning" style={{ marginTop: 16, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name="time-outline" size={22} color="warning" />
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {`${overdue.length} missed task${overdue.length === 1 ? '' : 's'}`}
        </Text>
        {!open ? <Button title="Reschedule" size="sm" variant="secondary" onPress={() => setOpen(true)} /> : null}
      </View>
      {open ? (
        !online ? (
          <View style={{ gap: 8 }}>
            <Text variant="caption" color="textMuted">
              Smart suggestions need a connection. You can still move them all to tomorrow morning.
            </Text>
            <Button title="Move all to tomorrow 9 AM" size="sm" onPress={() => void moveAllTomorrow()} />
          </View>
        ) : suggestions.isLoading ? (
          <LoadingState compact label="Finding free slots…" />
        ) : suggestions.error ? (
          <View style={{ gap: 8 }}>
            <Text variant="caption" color="danger">
              {errorMessage(suggestions.error)}
            </Text>
            <Button title="Move all to tomorrow 9 AM" size="sm" variant="secondary" onPress={() => void moveAllTomorrow()} />
          </View>
        ) : (suggestions.data ?? []).length === 0 ? (
          <Text variant="caption" color="textMuted">
            No free slots found in the next few days. Try moving them manually.
          </Text>
        ) : (
          <View>
            {suggestions.data!.map((s) => (
              <ListItem
                key={s.taskId}
                title={s.title}
                subtitle={`→ ${formatDateTime(s.suggestedDueAt)} · ${s.reason}`}
                right={
                  <Button
                    title="Apply"
                    size="sm"
                    variant="soft"
                    onPress={() => void apply(s).then((ok) => ok && toast.success(`Moved “${s.title}”`))}
                  />
                }
              />
            ))}
            <Button title="Apply all" size="sm" style={{ marginTop: 8 }} onPress={() => void applyAll(suggestions.data!)} />
          </View>
        )
      ) : null}
    </Card>
  );
}

function CalendarSection() {
  const { colors } = useTheme();
  const router = useRouter();
  const tasks = useEntities('task');
  const events = useEntities('event');
  const reminders = useEntities('reminder');
  const phoneSync = useSettingsStore((s) => s.deviceCalendarSync);
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selected, setSelected] = useState<Date>(today);

  // Visible grid range (the month plus spill-over days from adjacent months).
  const range = useMemo(
    () => ({ from: new Date(cursor.year, cursor.month, 1 - 7), to: new Date(cursor.year, cursor.month + 1, 7, 23, 59, 59) }),
    [cursor.year, cursor.month],
  );
  const busy = useMemo(
    () => busyDayKeys(range.from, range.to, { tasks: tasks.data ?? [], events: events.data ?? [] }),
    [tasks.data, events.data, range],
  );

  const phone = useQuery({
    queryKey: ['phone-calendar', cursor.year, cursor.month],
    queryFn: () => listPhoneEvents(range.from, range.to),
    enabled: phoneSync,
    retry: false,
  });
  const phoneBusy = useMemo(() => {
    const s = new Set<string>();
    for (const e of phone.data ?? []) s.add(localDateKey(e.start));
    return s;
  }, [phone.data]);

  const agenda = useMemo(
    () => buildDayAgenda(selected, { tasks: tasks.data ?? [], events: events.data ?? [], reminders: reminders.data ?? [] }),
    [selected, tasks.data, events.data, reminders.data],
  );
  const selectedKey = localDateKey(selected);
  const phoneToday = (phone.data ?? []).filter((e) => localDateKey(e.start) === selectedKey);
  const isEmpty = agenda.events.length + agenda.tasksDue.length + agenda.reminders.length + phoneToday.length === 0;

  const changeMonth = (delta: number) => {
    const d = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  };

  const newEventHref = () => {
    const start = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), 10, 0);
    return `/event/new?startAt=${encodeURIComponent(start.toISOString())}`;
  };

  return (
    <View>
      <MonthCalendar
        year={cursor.year}
        month={cursor.month}
        selectedKey={selectedKey}
        busy={busy}
        phoneBusy={phoneSync ? phoneBusy : undefined}
        onSelect={(cell) => {
          setSelected(cell.date);
          if (cell.date.getMonth() !== cursor.month) setCursor({ year: cell.date.getFullYear(), month: cell.date.getMonth() });
        }}
        onChangeMonth={changeMonth}
      />
      {phoneSync && phone.error ? (
        <Text variant="small" color="warning" style={{ marginTop: 8 }}>
          {errorMessage(phone.error)}
        </Text>
      ) : null}
      <SectionHeader title={relativeDay(selected)} action="Add event" onAction={() => router.push(newEventHref() as never)} />
      <Card padded={false} style={{ paddingHorizontal: 12, paddingVertical: 2 }}>
        {isEmpty ? (
          <EmptyState compact icon="calendar-clear-outline" title="Nothing planned" actionLabel="Add event" onAction={() => router.push(newEventHref() as never)} />
        ) : (
          <>
            {agenda.events.map((e) => (
              <EventRow key={e.event.id} event={e.event} start={e.start} />
            ))}
            {phoneToday.map((e) => (
              <ListItem
                key={`p-${e.id}`}
                icon="phone-portrait-outline"
                iconColor={colors.accent}
                title={e.title}
                subtitle={[e.allDay ? 'All day' : `${formatTime(e.start)} – ${formatTime(e.end)}`, e.location].filter(Boolean).join(' · ')}
                right={<Badge label="Phone" />}
              />
            ))}
            {agenda.reminders.map((r) => (
              <ReminderRow key={r.reminder.id} reminder={r.reminder} at={r.at} />
            ))}
            {agenda.tasksDue.map((t) => (
              <TaskRow key={t.id} task={t} showDate={false} />
            ))}
          </>
        )}
      </Card>
    </View>
  );
}

function RemindersSection() {
  const router = useRouter();
  const reminders = useEntities('reminder');
  const upcoming = useMemo(() => upcomingReminders(reminders.data ?? [], new Date(), 365), [reminders.data]);
  const upcomingIds = new Set(upcoming.map((u) => u.reminder.id));
  const past = (reminders.data ?? [])
    .filter((r) => !upcomingIds.has(r.id))
    .sort((a, b) => b.remindAt.localeCompare(a.remindAt))
    .slice(0, 50);

  if (reminders.isLoading) return <LoadingState compact label="Loading reminders…" />;
  if ((reminders.data ?? []).length === 0) {
    return (
      <EmptyState
        icon="alarm-outline"
        title="No reminders yet"
        body="Try quick add on Home: “remind me tomorrow at 9 to call mom”."
        actionLabel="Add reminder"
        onAction={() => router.push('/reminder/new')}
      />
    );
  }
  return (
    <View>
      <SectionHeader title={`Upcoming · ${upcoming.length}`} />
      <Card padded={false} style={{ paddingHorizontal: 12, paddingVertical: 2 }}>
        {upcoming.length === 0 ? (
          <Text variant="caption" color="textMuted" style={{ padding: 12 }}>
            No upcoming reminders.
          </Text>
        ) : (
          upcoming.map((u) => <ReminderRow key={u.reminder.id} reminder={u.reminder} at={u.at} />)
        )}
      </Card>
      {past.length > 0 ? (
        <>
          <SectionHeader title="Done & past" />
          <Card padded={false} style={{ paddingHorizontal: 12, paddingVertical: 2 }}>
            {past.map((r) => (
              <ReminderRow key={r.id} reminder={r} />
            ))}
          </Card>
        </>
      ) : null}
    </View>
  );
}
