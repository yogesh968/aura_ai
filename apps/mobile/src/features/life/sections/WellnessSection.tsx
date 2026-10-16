import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { localDateKey, WELLNESS_UNITS, type WellnessMetric } from '@aura/shared';
import {
  Button,
  Card,
  ListItem,
  ProgressRing,
  SectionHeader,
  Sheet,
  Text,
  TextField,
  Icon,
  type IconName,
} from '@/components/ui';
import { useEntities } from '@/lib/data';
import { createEntity, deleteEntity } from '@/lib/db/repo';
import { useSettingsStore } from '@/lib/settings';
import { toast } from '@/lib/toast';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { MiniBars, MoodPicker } from '../components';
import { lastNDays, MOOD_FACES, WELLNESS_META, wellnessByDay } from '../helpers';
import { useAiSuggestion } from '../useAiSuggestion';

const RING_METRICS: WellnessMetric[] = ['water', 'sleep', 'exercise', 'steps'];

export function WellnessSection() {
  const router = useRouter();
  const { colors } = useTheme();
  const targets = useSettingsStore((s) => s.preferences.wellnessTargets);
  const { data: entries = [] } = useEntities('wellness');
  const today = localDateKey();
  const days = lastNDays(7, today);
  const [logMetric, setLogMetric] = useState<WellnessMetric | null>(null);
  const ai = useAiSuggestion();

  const byMetric = useMemo(() => {
    const out = {} as Record<WellnessMetric, Map<string, number>>;
    for (const m of Object.keys(WELLNESS_META) as WellnessMetric[]) out[m] = wellnessByDay(entries, m);
    return out;
  }, [entries]);

  const targetFor = (m: WellnessMetric): number | undefined =>
    m === 'water' ? targets.waterMl : m === 'sleep' ? targets.sleepHours : m === 'exercise' ? targets.exerciseMinutes : m === 'steps' ? targets.steps : undefined;

  const log = async (metric: WellnessMetric, value: number) => {
    try {
      const entry = await createEntity('wellness', { metric, value, unit: WELLNESS_UNITS[metric], date: today, note: null });
      haptics.success();
      toast.success(`Logged ${WELLNESS_META[metric].label.toLowerCase()}: ${value} ${WELLNESS_UNITS[metric]}`, {
        label: 'Undo',
        onPress: () => void deleteEntity('wellness', entry.id).catch(() => toast.error('Could not undo')),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    }
  };

  const todayMood = byMetric.mood.get(today) ?? null;
  const weight = [...byMetric.weight.entries()].sort(([a], [b]) => b.localeCompare(a))[0];

  return (
    <View>
      <View style={styles.grid}>
        {RING_METRICS.map((m, i) => {
          const meta = WELLNESS_META[m];
          const value = byMetric[m].get(today) ?? 0;
          const target = targetFor(m) ?? 1;
          return (
            <Animated.View key={m} entering={FadeInDown.delay(i * 40).duration(250)} style={styles.cell}>
              <Card onPress={() => router.push(`/wellness/${m}`)} accessibilityLabel={`${meta.label}: ${value} of ${target} ${meta.unit}. Open details`} style={{ gap: 10 }}>
                <View style={styles.cellTop}>
                  <ProgressRing value={value / target} size={54} stroke={6} color={colors.categorical[i]} label={`${meta.label} progress`}>
                    <Icon name={meta.icon as IconName} size={18} color={colors.categorical[i]} />
                  </ProgressRing>
                  <View style={{ flex: 1 }}>
                    <Text variant="small" color="textMuted">
                      {meta.label}
                    </Text>
                    <Text variant="subheading" numberOfLines={1}>
                      {formatMetric(m, value)}
                    </Text>
                    <Text variant="small" color="textSubtle" numberOfLines={1}>
                      of {formatMetric(m, target)}
                    </Text>
                  </View>
                </View>
                <MiniBars values={days.map((d) => byMetric[m].get(d) ?? 0)} target={target} width={130} height={28} color={colors.categorical[i]} label={`${meta.label}, last 7 days`} />
                {m === 'water' ? (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <Button title="+250" size="sm" variant="soft" style={{ flex: 1, paddingHorizontal: 0 }} onPress={() => void log('water', 250)} accessibilityLabel="Add 250 millilitres of water" />
                    <Button title="+500" size="sm" variant="soft" style={{ flex: 1, paddingHorizontal: 0 }} onPress={() => void log('water', 500)} accessibilityLabel="Add 500 millilitres of water" />
                  </View>
                ) : (
                  <Button title="Log" size="sm" variant="soft" icon="add" onPress={() => setLogMetric(m)} accessibilityLabel={`Log ${meta.label.toLowerCase()}`} />
                )}
              </Card>
            </Animated.View>
          );
        })}
      </View>

      <SectionHeader title="How are you feeling?" />
      <Card style={{ gap: 12 }}>
        <MoodPicker value={todayMood} onChange={(v) => void log('mood', v)} />
        <Text variant="small" color="textMuted">
          {todayMood ? `Today: ${MOOD_FACES[todayMood - 1]} — tap again to log a new reading.` : 'Tap a face to log your mood.'}
        </Text>
      </Card>

      <SectionHeader title="Body" action="History" onAction={() => router.push('/wellness/weight')} />
      <Card>
        <ListItem
          icon="scale-outline"
          title={weight ? `${weight[1]} kg` : 'No weight logged'}
          subtitle={weight ? `Last logged ${weight[0] === today ? 'today' : weight[0]}` : 'Track it to see trends'}
          right={<Button title="Log" size="sm" variant="soft" onPress={() => setLogMetric('weight')} accessibilityLabel="Log weight" />}
        />
      </Card>

      <SectionHeader title="Mind & routine" />
      <Card padded={false} style={{ paddingHorizontal: 12 }}>
        <ListItem icon="journal-outline" title="Journal" subtitle="Reflect on your day" chevron onPress={() => router.push('/journal')} />
        <ListItem icon="repeat-outline" title="Routines" subtitle="Morning, evening and custom routines" chevron onPress={() => router.push('/routines')} />
      </Card>

      <SectionHeader title="Ideas from Aura" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button
          title="Meal plan"
          icon="restaurant-outline"
          variant="secondary"
          style={{ flex: 1 }}
          onPress={() =>
            void ai.run(
              'Meal plan',
              'Suggest a simple, balanced one-day meal plan (breakfast, lunch, snack, dinner) using everyday Indian home-cooking ingredients. Mention approximate portions and keep it practical. If dietary restrictions matter, add one line inviting the user to share them. Keep it under 200 words.',
            )
          }
        />
        <Button
          title="Workout ideas"
          icon="fitness-outline"
          variant="secondary"
          style={{ flex: 1 }}
          onPress={() =>
            void ai.run(
              'Workout ideas',
              `Suggest a beginner-friendly ${targets.exerciseMinutes}-minute home workout with no equipment: warm-up, main circuit with reps, cool-down. Add one safety tip. Keep it under 200 words.`,
            )
          }
        />
      </View>
      <Text variant="small" color="textSubtle" style={{ marginTop: 8 }}>
        Wellness suggestions are general information, not medical advice. Check with a doctor before big changes.
      </Text>

      <LogValueSheet metric={logMetric} onClose={() => setLogMetric(null)} onSave={(m, v) => void log(m, v)} />
      <AiSheet ai={ai} />
    </View>
  );
}

export function formatMetric(m: WellnessMetric, v: number) {
  if (m === 'water') return v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)} L` : `${Math.round(v)} ml`;
  if (m === 'steps') return Math.round(v).toLocaleString('en-IN');
  if (m === 'mood') return `${v}/5`;
  return `${Number(v.toFixed(1))} ${WELLNESS_UNITS[m]}`;
}

function LogValueSheet({ metric, onClose, onSave }: { metric: WellnessMetric | null; onClose: () => void; onSave: (m: WellnessMetric, v: number) => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const meta = metric ? WELLNESS_META[metric] : null;
  const close = () => {
    setText('');
    setError(null);
    onClose();
  };
  const save = () => {
    if (!metric) return;
    const v = Number(text.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) {
      setError('Enter a positive number');
      return;
    }
    if (metric === 'sleep' && v > 24) {
      setError('Sleep must be 24 hours or less');
      return;
    }
    onSave(metric, v);
    close();
  };
  return (
    <Sheet visible={metric !== null} onClose={close} title={meta ? `Log ${meta.label.toLowerCase()}` : ''} footer={<Button title="Save" onPress={save} fullWidth />}>
      {meta ? (
        <TextField
          label={`${meta.label} (${meta.unit})`}
          keyboardType="decimal-pad"
          value={text}
          onChangeText={(t) => {
            setText(t);
            setError(null);
          }}
          error={error}
          autoFocus
          onSubmitEditing={save}
          placeholder={metric === 'sleep' ? 'e.g. 7.5' : metric === 'steps' ? 'e.g. 6000' : metric === 'weight' ? 'e.g. 68.4' : 'e.g. 30'}
        />
      ) : null}
    </Sheet>
  );
}

function AiSheet({ ai }: { ai: ReturnType<typeof useAiSuggestion> }) {
  const s = ai.state;
  const visible = s.status !== 'idle';
  const saveNote = async () => {
    if (s.status !== 'done') return;
    try {
      await createEntity('note', { title: `${s.title} — ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`, content: s.text, tags: ['wellness'], kind: 'note' });
      toast.success('Saved to your notes');
      ai.reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    }
  };
  return (
    <Sheet
      visible={visible}
      onClose={ai.reset}
      title={s.status === 'idle' ? '' : s.title}
      footer={s.status === 'done' ? <Button title="Save as note" icon="bookmark-outline" onPress={() => void saveNote()} fullWidth /> : null}
    >
      {s.status === 'loading' ? (
        <View style={{ paddingVertical: 32, alignItems: 'center', gap: 12 }}>
          <ActivityIndicator />
          <Text variant="caption" color="textMuted">
            Aura is thinking…
          </Text>
        </View>
      ) : null}
      {s.status === 'error' ? (
        <Text variant="body" color="danger" style={{ paddingVertical: 16 }}>
          {s.message}
        </Text>
      ) : null}
      {s.status === 'done' ? (
        <View style={{ gap: 12, paddingBottom: 8 }}>
          <Text variant="body" selectable>
            {s.text}
          </Text>
          <Text variant="small" color="textSubtle">
            General information, not medical advice.
          </Text>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cell: { width: '47.5%', flexGrow: 1 },
  cellTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
