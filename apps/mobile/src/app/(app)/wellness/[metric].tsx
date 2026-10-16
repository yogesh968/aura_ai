import { useMemo, useState } from 'react';
import { Alert, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { localDateKey, WELLNESS_UNITS, type WellnessEntry } from '@aura/shared';
import {
  Button,
  Card,
  DateTimeField,
  Divider,
  EmptyState,
  IconButton,
  ListItem,
  Screen,
  ScreenHeader,
  SectionHeader,
  Sheet,
  Text,
  TextField,
} from '@/components/ui';
import { useEntities } from '@/lib/data';
import { createEntity, deleteEntity, updateEntity, ValidationError } from '@/lib/db/repo';
import { formatTime, relativeDay } from '@/lib/format';
import { useSettingsStore } from '@/lib/settings';
import { toast } from '@/lib/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { MiniBars, MoodPicker } from '@/features/life/components';
import { isWellnessMetric, lastNDays, MOOD_FACES, POINT_METRICS, WELLNESS_META, wellnessByDay } from '@/features/life/helpers';
import { formatMetric } from '@/features/life/sections/WellnessSection';

export default function WellnessMetricScreen() {
  const { metric: param } = useLocalSearchParams<{ metric: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const targets = useSettingsStore((s) => s.preferences.wellnessTargets);
  const { data: entries = [] } = useEntities('wellness');
  const [editing, setEditing] = useState<WellnessEntry | 'new' | null>(null);

  const metric = param && isWellnessMetric(param) ? param : null;
  const byDay = useMemo(() => (metric ? wellnessByDay(entries, metric) : new Map<string, number>()), [entries, metric]);
  const list = useMemo(
    () => entries.filter((e) => e.metric === metric).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 100),
    [entries, metric],
  );

  if (!metric) {
    return (
      <Screen header={<ScreenHeader title="Wellness" />}>
        <EmptyState icon="help-circle-outline" title="Unknown metric" actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }

  const meta = WELLNESS_META[metric];
  const days = lastNDays(30);
  const values = days.map((d) => byDay.get(d) ?? 0);
  const logged = values.filter((v) => v > 0);
  const avg = logged.length ? logged.reduce((s, v) => s + v, 0) / logged.length : 0;
  const target = metric === 'water' ? targets.waterMl : metric === 'sleep' ? targets.sleepHours : metric === 'exercise' ? targets.exerciseMinutes : metric === 'steps' ? targets.steps : undefined;

  const remove = (e: WellnessEntry) =>
    Alert.alert('Delete entry?', `${formatMetric(metric, e.value)} on ${relativeDay(`${e.date}T12:00:00`)}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteEntity('wellness', e.id).then(() => toast.success('Entry deleted'), () => toast.error('Could not delete the entry')) },
    ]);

  return (
    <Screen
      header={<ScreenHeader title={meta.label} subtitle={target ? `Daily target: ${formatMetric(metric, target)}` : undefined} right={<IconButton icon="add" label={`Add ${meta.label.toLowerCase()} entry`} onPress={() => setEditing('new')} />} />}
    >
      <Card style={{ gap: 12 }}>
        <Text variant="small" color="textMuted">
          Last 30 days
        </Text>
        <MiniBars values={values} target={target} width={width - 72} height={120} label={`${meta.label}, last 30 days`} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="caption" color="textMuted">
            {logged.length ? `${POINT_METRICS.includes(metric) ? 'Average reading' : 'Daily average'}: ${formatMetric(metric, Math.round(avg * 10) / 10)}` : 'No data yet'}
          </Text>
          {target ? (
            <Text variant="caption" color="success">
              {values.filter((v) => v >= target).length} days on target
            </Text>
          ) : null}
        </View>
      </Card>

      <SectionHeader title="Entries" />
      {list.length === 0 ? (
        <EmptyState compact icon={meta.icon as never} title={`No ${meta.label.toLowerCase()} logged`} actionLabel="Add entry" onAction={() => setEditing('new')} />
      ) : (
        <Card padded={false} style={{ paddingHorizontal: 12 }}>
          {list.map((e, i) => (
            <View key={e.id}>
              {i > 0 ? <Divider /> : null}
              <ListItem
                title={metric === 'mood' ? `${MOOD_FACES[Math.min(4, Math.max(0, e.value - 1))]} ${e.value}/5` : formatMetric(metric, e.value)}
                subtitle={`${relativeDay(`${e.date}T12:00:00`)} · added ${formatTime(e.createdAt)}${e.note ? ` · ${e.note}` : ''}`}
                onPress={() => setEditing(e)}
                right={<IconButton icon="trash-outline" label="Delete entry" color={colors.danger} onPress={() => remove(e)} />}
              />
            </View>
          ))}
        </Card>
      )}
      <EntrySheet metric={metric} entry={editing} onClose={() => setEditing(null)} />
    </Screen>
  );
}

function EntrySheet({ metric, entry, onClose }: { metric: WellnessEntry['metric']; entry: WellnessEntry | 'new' | null; onClose: () => void }) {
  const existing = entry && entry !== 'new' ? entry : null;
  const key = existing?.id ?? (entry === 'new' ? 'new' : 'none');
  return entry ? <EntryForm key={key} metric={metric} existing={existing} onClose={onClose} /> : null;
}

function EntryForm({ metric, existing, onClose }: { metric: WellnessEntry['metric']; existing: WellnessEntry | null; onClose: () => void }) {
  const [value, setValue] = useState(existing ? String(existing.value) : '');
  const [mood, setMood] = useState<number | null>(existing && metric === 'mood' ? existing.value : null);
  const [date, setDate] = useState<Date>(existing ? new Date(`${existing.date}T12:00:00`) : new Date());
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const v = metric === 'mood' ? mood : Number(value.replace(',', '.'));
    if (v == null || !Number.isFinite(v) || v <= 0) {
      setError(metric === 'mood' ? 'Pick a mood' : 'Enter a positive number');
      return;
    }
    const input = { metric, value: v, unit: WELLNESS_UNITS[metric], date: localDateKey(date), note: note.trim() || null };
    try {
      if (existing) await updateEntity('wellness', existing.id, input);
      else await createEntity('wellness', input);
      toast.success('Saved');
      onClose();
    } catch (e) {
      setError(e instanceof ValidationError ? e.message : e instanceof Error ? e.message : 'Could not save');
    }
  };

  return (
    <Sheet visible onClose={onClose} title={existing ? 'Edit entry' : `Add ${WELLNESS_META[metric].label.toLowerCase()}`} footer={<Button title="Save" onPress={() => void save()} fullWidth />}>
      <View style={{ gap: 14 }}>
        {metric === 'mood' ? (
          <MoodPicker value={mood} onChange={setMood} />
        ) : (
          <TextField label={`Value (${WELLNESS_META[metric].unit})`} keyboardType="decimal-pad" value={value} onChangeText={setValue} autoFocus={!existing} />
        )}
        <DateTimeField label="Date" mode="date" value={date} onChange={(d) => d && setDate(d)} clearable={false} />
        <TextField label="Note (optional)" value={note} onChangeText={setNote} maxLength={1000} />
        {error ? (
          <Text variant="small" color="danger">
            {error}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}
