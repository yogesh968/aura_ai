import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { parseQuickAdd, recurrenceLabel, type CalendarEvent, type QuickAddResult, type Reminder, type Task } from '@aura/shared';
import { Badge, Button, Checkbox, Icon, IconButton, ListItem, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { createEntity } from '@/lib/db/repo';
import { formatDateTime, formatTime, relativeDay } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { errorMessage } from '@/lib/api/client';
import { useSyncStore } from '@/lib/sync/engine';
import { useOnline } from '@/lib/network';
import { buildMonthGrid, type MonthCell } from './logic';
import { toggleReminderDone, toggleTaskDone } from './actions';

export function PriorityDot({ priority }: { priority: Task['priority'] }) {
  const { colors } = useTheme();
  return <View accessibilityLabel={`${priority} priority`} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.priority[priority] }} />;
}

export function TaskRow({ task, showDate = true }: { task: Task; showDate?: boolean }) {
  const router = useRouter();
  const done = task.status === 'done';
  const overdue = !done && task.dueAt && new Date(task.dueAt) < new Date();
  const meta = [
    task.dueAt ? (showDate ? formatDateTime(task.dueAt) : formatTime(task.dueAt)) : null,
    task.recurrence !== 'none' ? recurrenceLabel(task.recurrence) : null,
    task.estimateMinutes ? `${task.estimateMinutes} min` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <ListItem
      title={task.title}
      subtitle={overdue ? `Overdue · ${meta}` : meta || null}
      strikethrough={done}
      onPress={() => router.push(`/task/${task.id}`)}
      left={<Checkbox checked={done} onToggle={() => void toggleTaskDone(task)} label={done ? `Mark “${task.title}” not done` : `Complete “${task.title}”`} />}
      right={<PriorityDot priority={task.priority} />}
    />
  );
}

export function EventRow({ event, start }: { event: CalendarEvent; start: Date }) {
  const router = useRouter();
  const { colors } = useTheme();
  const icon = event.kind === 'birthday' ? 'gift-outline' : event.kind === 'appointment' ? 'medkit-outline' : 'calendar-outline';
  const time = event.allDay ? 'All day' : `${formatTime(start)}${event.endAt && event.recurrence === 'none' ? ` – ${formatTime(event.endAt)}` : ''}`;
  return (
    <ListItem
      title={event.title}
      subtitle={[time, event.location].filter(Boolean).join(' · ')}
      icon={icon}
      iconColor={event.kind === 'birthday' ? colors.categorical[4] : colors.categorical[1]}
      onPress={() => router.push(`/event/${event.id}`)}
      chevron
    />
  );
}

export function ReminderRow({ reminder, at }: { reminder: Reminder; at?: Date }) {
  const router = useRouter();
  const when = at ?? new Date(reminder.remindAt);
  return (
    <ListItem
      title={reminder.title}
      subtitle={[formatDateTime(when), reminder.recurrence !== 'none' ? recurrenceLabel(reminder.recurrence) : null].filter(Boolean).join(' · ')}
      strikethrough={reminder.done}
      onPress={() => router.push(`/reminder/${reminder.id}`)}
      left={<Checkbox checked={reminder.done} onToggle={() => void toggleReminderDone(reminder)} label={reminder.done ? `Mark “${reminder.title}” not done` : `Mark “${reminder.title}” done`} />}
      right={<Icon name="notifications-outline" size={16} color="textSubtle" />}
    />
  );
}

function describeParsed(p: QuickAddResult) {
  const kind = p.kind === 'reminder' ? 'Reminder' : p.kind === 'event' ? 'Event' : 'Task';
  const when = p.at ? (p.hasTime ? formatDateTime(p.at) : relativeDay(p.at)) : 'No date';
  return [kind, when, p.recurrence !== 'none' ? recurrenceLabel(p.recurrence) : null, p.priority !== 'medium' ? `${p.priority} priority` : null]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Offline quick capture: natural language ("remind me tomorrow at 9 to call
 * mom", Hinglish too) parsed on-device, previewed, then saved locally.
 */
export function QuickAddBar() {
  const { colors, radius, typography } = useTheme();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const parsed = useMemo(() => (text.trim().length >= 3 ? parseQuickAdd(text) : null), [text]);

  const save = async () => {
    if (!parsed) return;
    setSaving(true);
    try {
      if (parsed.kind === 'reminder') {
        if (!parsed.at) {
          toast.error('Add a time, e.g. “tomorrow at 9am”.');
          return;
        }
        await createEntity('reminder', { title: parsed.title, remindAt: parsed.at, recurrence: parsed.recurrence });
      } else if (parsed.kind === 'event' && parsed.at) {
        await createEntity('event', {
          title: parsed.title,
          startAt: parsed.at,
          endAt: new Date(new Date(parsed.at).getTime() + 3_600_000).toISOString(),
          recurrence: parsed.recurrence,
        });
      } else {
        await createEntity('task', { title: parsed.title, dueAt: parsed.at, priority: parsed.priority, recurrence: parsed.at ? parsed.recurrence : 'none' });
      }
      haptics.success();
      toast.success(`Saved · ${describeParsed(parsed)}`);
      setText('');
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't save that"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: 6 }}>
      <View style={[styles.quick, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
        <Icon name="add-circle-outline" size={22} color="primary" />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Quick add: “Call mom tomorrow 9am”"
          placeholderTextColor={colors.textSubtle}
          accessibilityLabel="Quick add a task, reminder or event"
          returnKeyType="done"
          onSubmitEditing={() => void save()}
          style={[typography.body, { flex: 1, color: colors.text, paddingVertical: 10 }]}
        />
        {parsed ? <IconButton icon="arrow-up-circle" label="Save quick add" color={colors.primary} size={28} onPress={() => void save()} disabled={saving} /> : null}
      </View>
      {parsed ? (
        <Animated.View entering={FadeIn.duration(150)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6 }}>
          <Icon name="sparkles-outline" size={14} color="primary" />
          <Text variant="small" color="textMuted" numberOfLines={1} style={{ flex: 1 }}>
            {`${describeParsed(parsed)} — “${parsed.title}”`}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

export function SyncChip() {
  const router = useRouter();
  const { colors, radius } = useTheme();
  const online = useOnline();
  const { status, pending, lastError } = useSyncStore();
  const { icon, label, tone } = !online
    ? { icon: 'cloud-offline-outline' as const, label: pending ? `Offline · ${pending} to sync` : 'Offline', tone: colors.warning }
    : status === 'syncing'
      ? { icon: 'sync-outline' as const, label: 'Syncing…', tone: colors.textMuted }
      : status === 'error' || lastError
        ? { icon: 'alert-circle-outline' as const, label: 'Sync issue', tone: colors.danger }
        : pending
          ? { icon: 'cloud-upload-outline' as const, label: `${pending} to sync`, tone: colors.textMuted }
          : { icon: 'cloud-done-outline' as const, label: 'Synced', tone: colors.success };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Sync status: ${label}`}
      onPress={() => router.push('/settings/sync')}
      style={[styles.chip, { borderRadius: radius.pill, backgroundColor: colors.surfaceAlt }]}
    >
      <Icon name={icon} size={14} color={tone} />
      <Text variant="small" style={{ color: tone }}>
        {label}
      </Text>
    </Pressable>
  );
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function MonthCalendar({
  year,
  month,
  selectedKey,
  busy,
  phoneBusy,
  onSelect,
  onChangeMonth,
}: {
  year: number;
  month: number;
  selectedKey: string;
  busy: Set<string>;
  phoneBusy?: Set<string>;
  onSelect: (cell: MonthCell) => void;
  onChangeMonth: (delta: number) => void;
}) {
  const { colors, radius } = useTheme();
  const weeks = useMemo(() => buildMonthGrid(year, month, 1), [year, month]);
  const title = new Date(year, month, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  return (
    <View style={[styles.calendar, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
      <View style={styles.calHeader}>
        <IconButton icon="chevron-back" label="Previous month" onPress={() => onChangeMonth(-1)} />
        <Text variant="subheading" accessibilityRole="header">
          {title}
        </Text>
        <IconButton icon="chevron-forward" label="Next month" onPress={() => onChangeMonth(1)} />
      </View>
      <View style={styles.weekRow}>
        {WEEKDAYS.map((d) => (
          <Text key={d} variant="small" color="textSubtle" align="center" style={{ flex: 1 }}>
            {d}
          </Text>
        ))}
      </View>
      {weeks.map((week, i) => (
        <View key={i} style={styles.weekRow}>
          {week.map((cell) => {
            const selected = cell.key === selectedKey;
            const hasItems = busy.has(cell.key);
            const hasPhone = phoneBusy?.has(cell.key);
            return (
              <Pressable
                key={cell.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${cell.date.toDateString()}${hasItems ? ', has plans' : ''}`}
                onPress={() => {
                  haptics.tap();
                  onSelect(cell);
                }}
                style={styles.dayCell}
              >
                <View
                  style={[
                    styles.dayInner,
                    selected ? { backgroundColor: colors.primary } : cell.isToday ? { borderWidth: 1.5, borderColor: colors.primary } : null,
                  ]}
                >
                  <Text variant="caption" weight={cell.isToday || selected ? '700' : '400'} style={{ color: selected ? colors.primaryText : cell.inMonth ? colors.text : colors.textSubtle }}>
                    {cell.date.getDate()}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 2, height: 5 }}>
                  {hasItems ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
                  {hasPhone ? <View style={[styles.dot, { backgroundColor: colors.accent }]} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Compact card linking to the full Plan view of a section. */
export function SectionCardHeader({ title, count, actionLabel, onAction }: { title: string; count?: number; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <Text variant="subheading" style={{ flex: 1 }}>
        {title}
      </Text>
      {count != null ? <Badge label={String(count)} /> : null}
      {actionLabel && onAction ? <Button title={actionLabel} size="sm" variant="ghost" onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  quick: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 4, borderWidth: 1, minHeight: 52 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  calendar: { borderWidth: StyleSheet.hairlineWidth, paddingBottom: 8, paddingHorizontal: 6 },
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekRow: { flexDirection: 'row' },
  dayCell: { flex: 1, alignItems: 'center', paddingVertical: 3, minHeight: 46 },
  dayInner: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
});
