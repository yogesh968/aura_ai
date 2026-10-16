import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Goal } from '@aura/shared';
import {
  Button,
  Card,
  ChipGroup,
  DateTimeField,
  EmptyState,
  IconButton,
  LoadingState,
  ProgressBar,
  Screen,
  ScreenHeader,
  Text,
  TextField,
} from '@/components/ui';
import { useEntity } from '@/lib/data';
import { createEntity, deleteEntity, updateEntity, ValidationError } from '@/lib/db/repo';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { useTheme } from '@/theme/ThemeProvider';

const num = (s: string) => {
  const v = Number(s.replace(/,/g, '').trim());
  return s.trim() === '' ? null : Number.isFinite(v) ? v : NaN;
};

export default function GoalEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const { data: goal, isLoading } = useEntity('goal', isNew ? undefined : id);

  if (!isNew && isLoading) {
    return (
      <Screen header={<ScreenHeader title="Goal" />}>
        <LoadingState />
      </Screen>
    );
  }
  if (!isNew && !goal) {
    return (
      <Screen header={<ScreenHeader title="Goal" />}>
        <EmptyState icon="alert-circle-outline" title="Goal not found" actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }
  return <GoalForm key={id} id={id} goal={goal ?? null} />;
}

function GoalForm({ id, goal }: { id: string; goal: Goal | null }) {
  const isNew = goal === null;
  const router = useRouter();
  const { colors } = useTheme();

  const [title, setTitle] = useState(goal?.title ?? '');
  const [kind, setKind] = useState<Goal['kind']>(goal?.kind ?? 'personal');
  const [target, setTarget] = useState(goal?.targetValue != null ? String(goal.targetValue) : '');
  const [current, setCurrent] = useState(goal ? String(goal.currentValue) : '0');
  const [unit, setUnit] = useState(goal?.unit ?? '');
  const [deadline, setDeadline] = useState<Date | null>(goal?.deadline ? new Date(goal.deadline) : null);
  const [status, setStatus] = useState<Goal['status']>(goal?.status ?? 'active');
  const [add, setAdd] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const t = num(target);
  const c = num(current) ?? 0;
  const progress = t && t > 0 && Number.isFinite(c) ? c / t : null;

  const build = (overrides: Partial<Goal> = {}) => ({
    title: title.trim(),
    kind,
    targetValue: t,
    currentValue: c,
    unit: unit.trim() || null,
    deadline: deadline ? deadline.toISOString() : null,
    status,
    ...overrides,
  });

  const save = async () => {
    if (Number.isNaN(t) || Number.isNaN(c)) {
      setErrors({ targetValue: Number.isNaN(t) ? 'Enter a number' : '', currentValue: Number.isNaN(c) ? 'Enter a number' : '' });
      return;
    }
    setSaving(true);
    try {
      if (isNew) await createEntity('goal', build());
      else await updateEntity('goal', id, build());
      toast.success(isNew ? 'Goal created' : 'Goal saved');
      router.back();
    } catch (e) {
      if (e instanceof ValidationError) setErrors(e.fields);
      else toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const addProgress = async () => {
    const v = num(add);
    if (v == null || Number.isNaN(v) || v === 0) return;
    const next = Math.max(0, c + v);
    const reached = t != null && t > 0 && next >= t && status === 'active';
    if (isNew) {
      // Not saved yet: the value is part of the form and is written on Save.
      setCurrent(String(next));
      setAdd('');
      return;
    }
    try {
      await updateEntity('goal', id, { currentValue: next, ...(reached ? { status: 'achieved' as const } : {}) });
      // Reflect the new value only once it's stored.
      setCurrent(String(next));
      setAdd('');
      if (reached) {
        setStatus('achieved');
        haptics.success();
        toast.success('Goal achieved! 🎉');
      } else toast.success('Progress updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update');
    }
  };

  const remove = () =>
    Alert.alert('Delete goal?', `“${title}” will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteEntity('goal', id);
            toast.success('Goal deleted');
            router.back();
          } catch {
            toast.error('Could not delete the goal');
          }
        },
      },
    ]);

  return (
    <Screen
      header={<ScreenHeader title={isNew ? 'New goal' : 'Goal'} right={!isNew ? <IconButton icon="trash-outline" label="Delete goal" color={colors.danger} onPress={remove} /> : null} />}
      footer={
        <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
          <Button title={isNew ? 'Create goal' : 'Save'} onPress={() => void save()} loading={saving} fullWidth />
        </View>
      }
    >
      <View style={{ gap: 16 }}>
        {!isNew ? (
          <Card style={{ gap: 10 }}>
            <Text variant="caption" color="textMuted">
              Progress
            </Text>
            <Text variant="title">
              {c}
              {t != null && !Number.isNaN(t) ? ` / ${t}` : ''} {unit}
            </Text>
            {progress != null ? <ProgressBar value={progress} color={status === 'achieved' ? colors.success : undefined} label="Goal progress" /> : null}
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <TextField label="Add progress" placeholder="e.g. 5000 or -200" keyboardType="numbers-and-punctuation" value={add} onChangeText={setAdd} onSubmitEditing={() => void addProgress()} />
              </View>
              <Button title="Add" onPress={() => void addProgress()} disabled={!add.trim()} />
            </View>
          </Card>
        ) : null}
        <TextField label="Goal" placeholder="e.g. Save for a new laptop" value={title} onChangeText={setTitle} error={errors.title} autoFocus={isNew} maxLength={200} />
        <View style={{ gap: 8 }}>
          <Text variant="small" color="textMuted">
            Type
          </Text>
          <ChipGroup
            value={kind}
            onChange={setKind}
            options={[
              { value: 'personal', label: 'Personal', icon: 'person-outline' },
              { value: 'financial', label: 'Money', icon: 'wallet-outline' },
              { value: 'fitness', label: 'Fitness', icon: 'fitness-outline' },
              { value: 'learning', label: 'Learning', icon: 'school-outline' },
            ]}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <TextField label="Target (optional)" keyboardType="decimal-pad" value={target} onChangeText={setTarget} error={errors.targetValue || null} />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Current" keyboardType="decimal-pad" value={current} onChangeText={setCurrent} error={errors.currentValue || null} />
          </View>
        </View>
        <TextField label="Unit (optional)" placeholder="₹, km, books" value={unit} onChangeText={setUnit} maxLength={30} />
        <DateTimeField label="Deadline" mode="date" value={deadline} onChange={setDeadline} icon="flag-outline" />
        {!isNew ? (
          <View style={{ gap: 8 }}>
            <Text variant="small" color="textMuted">
              Status
            </Text>
            <ChipGroup
              value={status}
              onChange={setStatus}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'achieved', label: 'Achieved' },
                { value: 'abandoned', label: 'Abandoned' },
              ]}
            />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
