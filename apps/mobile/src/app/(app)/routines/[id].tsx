import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Routine } from '@aura/shared';
import {
  Button,
  ChipGroup,
  DateTimeField,
  EmptyState,
  IconButton,
  LoadingState,
  Screen,
  ScreenHeader,
  SectionHeader,
  Text,
  TextField,
  ToggleRow,
} from '@/components/ui';
import { useEntity } from '@/lib/data';
import { createEntity, deleteEntity, updateEntity, ValidationError } from '@/lib/db/repo';
import { toast } from '@/lib/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { WEEKDAY_LABELS, WEEKDAY_NAMES } from '@/features/life/components';

const DEFAULT_TIME: Record<Routine['timeOfDay'], string> = { morning: '07:00', afternoon: '13:00', evening: '19:00', night: '22:00' };

function timeToDate(hhmm: string | null): Date | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}
const dateToTime = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export default function RoutineEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const { data: routine, isLoading } = useEntity('routine', isNew ? undefined : id);

  if (!isNew && isLoading) {
    return (
      <Screen header={<ScreenHeader title="Routine" />}>
        <LoadingState />
      </Screen>
    );
  }
  if (!isNew && !routine) {
    return (
      <Screen header={<ScreenHeader title="Routine" />}>
        <EmptyState icon="alert-circle-outline" title="Routine not found" actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }
  return <RoutineForm key={id} id={id} routine={routine ?? null} />;
}

function RoutineForm({ id, routine }: { id: string; routine: Routine | null }) {
  const isNew = routine === null;
  const router = useRouter();
  const { colors, radius } = useTheme();

  const [name, setName] = useState(routine?.name ?? '');
  const [timeOfDay, setTimeOfDay] = useState<Routine['timeOfDay']>(routine?.timeOfDay ?? 'morning');
  const [time, setTime] = useState<string | null>(routine ? routine.time : DEFAULT_TIME.morning);
  const [days, setDays] = useState<number[]>(routine?.days ?? [0, 1, 2, 3, 4, 5, 6]);
  const [steps, setSteps] = useState<string[]>(routine?.steps ?? []);
  const [newStep, setNewStep] = useState('');
  const [active, setActive] = useState(routine?.active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const addStep = () => {
    const s = newStep.trim();
    if (!s) return;
    if (steps.length >= 30) {
      toast.error('Up to 30 steps');
      return;
    }
    setSteps([...steps, s]);
    setNewStep('');
  };
  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setSteps(next);
  };

  const save = async () => {
    const pendingStep = newStep.trim();
    const input = { name: name.trim(), timeOfDay, time, days: [...days].sort(), steps: pendingStep ? [...steps, pendingStep] : steps, active };
    setSaving(true);
    try {
      if (isNew) await createEntity('routine', input);
      else await updateEntity('routine', id, input);
      toast.success(isNew ? 'Routine created' : 'Routine saved');
      router.back();
    } catch (e) {
      if (e instanceof ValidationError) setErrors(e.fields);
      else toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    Alert.alert('Delete routine?', `“${name}” will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteEntity('routine', id);
            toast.success('Routine deleted');
            router.back();
          } catch {
            toast.error('Could not delete the routine');
          }
        },
      },
    ]);

  return (
    <Screen
      header={<ScreenHeader title={isNew ? 'New routine' : 'Edit routine'} right={!isNew ? <IconButton icon="trash-outline" label="Delete routine" color={colors.danger} onPress={remove} /> : null} />}
      footer={
        <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
          <Button title={isNew ? 'Create routine' : 'Save'} onPress={() => void save()} loading={saving} fullWidth />
        </View>
      }
    >
      <View style={{ gap: 16 }}>
        <TextField label="Name" placeholder="e.g. Morning" value={name} onChangeText={setName} error={errors.name} autoFocus={isNew} maxLength={200} />
        <View style={{ gap: 8 }}>
          <Text variant="small" color="textMuted">
            Time of day
          </Text>
          <ChipGroup
            value={timeOfDay}
            onChange={(v) => {
              setTimeOfDay(v);
              if (!time || Object.values(DEFAULT_TIME).includes(time)) setTime(DEFAULT_TIME[v]);
            }}
            options={[
              { value: 'morning', label: 'Morning', icon: 'sunny-outline' },
              { value: 'afternoon', label: 'Afternoon', icon: 'partly-sunny-outline' },
              { value: 'evening', label: 'Evening', icon: 'cloudy-night-outline' },
              { value: 'night', label: 'Night', icon: 'moon-outline' },
            ]}
          />
        </View>
        <DateTimeField label="Start time" mode="time" icon="time-outline" value={timeToDate(time)} onChange={(d) => setTime(d ? dateToTime(d) : null)} placeholder="Any time" />
        <View style={{ gap: 8 }}>
          <Text variant="small" color="textMuted">
            Days
          </Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {WEEKDAY_LABELS.map((label, d) => {
              const on = days.includes(d);
              return (
                <Pressable
                  key={d}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={WEEKDAY_NAMES[d]}
                  onPress={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
                  style={{ flex: 1, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.primary : colors.surface, borderWidth: 1, borderColor: on ? colors.primary : colors.border }}
                >
                  <Text variant="caption" weight="700" style={{ color: on ? colors.primaryText : colors.textMuted }}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {errors.days ? (
            <Text variant="small" color="danger">
              {errors.days}
            </Text>
          ) : null}
        </View>

        <SectionHeader title={`Steps (${steps.length})`} />
        {steps.map((s, i) => (
          <View key={`${i}-${s}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text variant="caption" color="textMuted" style={{ width: 22 }}>
              {i + 1}.
            </Text>
            <View style={{ flex: 1 }}>
              <TextField value={s} onChangeText={(t) => setSteps(steps.map((x, j) => (j === i ? t : x)))} accessibilityLabel={`Step ${i + 1}`} maxLength={200} />
            </View>
            <IconButton icon="arrow-up" label={`Move step ${i + 1} up`} disabled={i === 0} onPress={() => move(i, -1)} size={18} />
            <IconButton icon="arrow-down" label={`Move step ${i + 1} down`} disabled={i === steps.length - 1} onPress={() => move(i, 1)} size={18} />
            <IconButton icon="close" label={`Remove step ${i + 1}`} onPress={() => setSteps(steps.filter((_, j) => j !== i))} size={18} />
          </View>
        ))}
        {errors.steps || Object.keys(errors).some((k) => k.startsWith('steps.')) ? (
          <Text variant="small" color="danger">
            Steps can&apos;t be empty.
          </Text>
        ) : null}
        <TextField placeholder="Add a step, e.g. Drink a glass of water" value={newStep} onChangeText={setNewStep} onSubmitEditing={addStep} returnKeyType="done" maxLength={200} right={<IconButton icon="add-circle" label="Add step" onPress={addStep} />} />

        {!isNew ? <ToggleRow label="Active" description="Paused routines don't show nudges" value={active} onChange={setActive} icon="pulse-outline" /> : null}
        {!isNew ? (
          <Button
            title="Turn into automation"
            icon="flash-outline"
            variant="secondary"
            onPress={() => router.push({ pathname: '/automations/[id]', params: { id: 'new', fromRoutine: id } })}
            accessibilityHint="Creates an automation that reminds you when this routine starts"
          />
        ) : null}
      </View>
    </Screen>
  );
}
