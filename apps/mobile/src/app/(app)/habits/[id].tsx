import { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Habit, HabitLog } from '@aura/shared';
import {
  Button,
  Card,
  ChipGroup,
  Divider,
  EmptyState,
  Icon,
  IconButton,
  ListItem,
  LoadingState,
  Screen,
  ScreenHeader,
  SectionHeader,
  Text,
  TextField,
  ToggleRow,
} from '@/components/ui';
import { useEntities, useEntity } from '@/lib/data';
import { createEntity, deleteEntity, restoreEntity, updateEntity, ValidationError } from '@/lib/db/repo';
import { relativeDay } from '@/lib/format';
import { toast } from '@/lib/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { HABIT_ICONS } from '@/features/life/components';
import { habitStreak } from '@/features/life/helpers';

export default function HabitEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const { data: habit, isLoading } = useEntity('habit', isNew ? undefined : id);

  if (!isNew && isLoading) {
    return (
      <Screen header={<ScreenHeader title="Habit" />}>
        <LoadingState />
      </Screen>
    );
  }
  if (!isNew && !habit) {
    return (
      <Screen header={<ScreenHeader title="Habit" />}>
        <EmptyState icon="alert-circle-outline" title="Habit not found" body="It may have been deleted on another device." actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }
  return <HabitForm key={id} id={id} habit={habit ?? null} />;
}

function HabitForm({ id, habit }: { id: string; habit: Habit | null }) {
  const isNew = habit === null;
  const router = useRouter();
  const { colors, radius } = useTheme();
  const { data: logs = [] } = useEntities('habitLog');

  const [name, setName] = useState(habit?.name ?? '');
  const [icon, setIcon] = useState<string>(habit?.icon ?? HABIT_ICONS[0]!);
  const [color, setColor] = useState<string | null>(habit?.color ?? null);
  const [frequency, setFrequency] = useState<Habit['frequency']>(habit?.frequency ?? 'daily');
  const [target, setTarget] = useState(habit ? String(habit.target) : '1');
  const [unit, setUnit] = useState(habit?.unit ?? '');
  const [archived, setArchived] = useState(habit?.archived ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const history = useMemo(() => logs.filter((l) => l.habitId === id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 60), [logs, id]);

  const removeLog = async (log: HabitLog) => {
    try {
      await deleteEntity('habitLog', log.id);
      toast.success('Log removed', {
        label: 'Undo',
        onPress: () => void restoreEntity('habitLog', log).catch(() => toast.error('Could not restore the log')),
      });
    } catch {
      toast.error('Could not remove the log');
    }
  };

  const save = async () => {
    const t = Number(target.replace(',', '.'));
    if (!Number.isFinite(t) || t <= 0) {
      setErrors({ target: 'Target must be a positive number' });
      return;
    }
    const input = { name: name.trim(), icon, color, frequency, target: t, unit: unit.trim() || null, archived };
    setSaving(true);
    try {
      if (isNew) await createEntity('habit', input);
      else await updateEntity('habit', id, input);
      toast.success(isNew ? 'Habit created' : 'Habit saved');
      router.back();
    } catch (e) {
      if (e instanceof ValidationError) setErrors(e.fields);
      else toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    Alert.alert('Delete habit?', `“${name}” and its streak will be removed. Logged history stays in your backup until deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteEntity('habit', id);
            toast.success('Habit deleted');
            router.back();
          } catch {
            toast.error('Could not delete the habit');
          }
        },
      },
    ]);

  const streak = habit ? habitStreak(habit, logs) : 0;

  return (
    <Screen
      header={
        <ScreenHeader
          title={isNew ? 'New habit' : 'Edit habit'}
          subtitle={!isNew && streak > 0 ? `🔥 ${streak} ${frequency === 'weekly' ? 'week' : 'day'} streak` : undefined}
          right={!isNew ? <IconButton icon="trash-outline" label="Delete habit" color={colors.danger} onPress={remove} /> : null}
        />
      }
      footer={
        <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
          <Button title={isNew ? 'Create habit' : 'Save'} onPress={() => void save()} loading={saving} fullWidth />
        </View>
      }
    >
      <View style={{ gap: 16 }}>
        <TextField label="Name" placeholder="e.g. Meditate" value={name} onChangeText={setName} error={errors.name} autoFocus={isNew} maxLength={200} />
        <View style={{ gap: 8 }}>
          <Text variant="small" color="textMuted">
            How often
          </Text>
          <ChipGroup
            value={frequency}
            onChange={setFrequency}
            options={[
              { value: 'daily', label: 'Every day' },
              { value: 'weekly', label: 'Per week' },
            ]}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <TextField label={frequency === 'weekly' ? 'Target per week' : 'Target per day'} keyboardType="decimal-pad" value={target} onChangeText={setTarget} error={errors.target} />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Unit (optional)" placeholder="min, pages, glasses" value={unit} onChangeText={setUnit} maxLength={30} />
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text variant="small" color="textMuted">
            Icon
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {HABIT_ICONS.map((ic) => {
              const active = ic === icon;
              return (
                <Pressable
                  key={ic}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={ic.replace(/-outline$/, '').replace(/-/g, ' ')}
                  onPress={() => setIcon(ic)}
                  style={{ width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? colors.primarySoft : colors.surface, borderWidth: 1, borderColor: active ? colors.primary : colors.border }}
                >
                  <Icon name={ic as never} size={22} color={active ? 'primary' : 'textMuted'} />
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text variant="small" color="textMuted">
            Color
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {colors.categorical.map((c) => {
              const active = c === color;
              return (
                <Pressable
                  key={c}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Color ${c}`}
                  onPress={() => setColor(c)}
                  style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c, borderWidth: 3, borderColor: active ? colors.text : 'transparent' }}
                />
              );
            })}
          </View>
        </View>

        {!isNew ? <ToggleRow label="Archived" description="Hide from your daily list without deleting history" value={archived} onChange={setArchived} icon="archive-outline" /> : null}

        {!isNew ? (
          <>
            <SectionHeader title="History" />
            {history.length === 0 ? (
              <Text variant="caption" color="textMuted">
                No logs yet. Tap the ring on the Habits tab to log progress.
              </Text>
            ) : (
              <Card padded={false} style={{ paddingHorizontal: 12 }}>
                {history.map((l, i) => (
                  <View key={l.id}>
                    {i > 0 ? <Divider /> : null}
                    <ListItem
                      icon="checkmark-circle-outline"
                      title={`+${l.value}${unit ? ` ${unit}` : ''}`}
                      subtitle={relativeDay(`${l.date}T12:00:00`)}
                      right={<IconButton icon="close" label={`Delete log from ${l.date}`} onPress={() => void removeLog(l)} />}
                    />
                  </View>
                ))}
              </Card>
            )}
          </>
        ) : null}
      </View>
    </Screen>
  );
}
