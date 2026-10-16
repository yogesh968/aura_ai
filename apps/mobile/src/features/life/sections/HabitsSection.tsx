import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { localDateKey, type Habit } from '@aura/shared';
import { Card, EmptyState, Icon, LoadingState, ProgressRing, Text, type IconName } from '@/components/ui';
import { useEntities } from '@/lib/data';
import { createEntity, deleteEntity } from '@/lib/db/repo';
import { toast } from '@/lib/toast';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { WeekDots } from '../components';
import { habitDailyTotals, habitPeriodProgress, habitStreak, lastNDays } from '../helpers';

export function HabitsSection() {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: habits, isLoading } = useEntities('habit');
  const { data: logs = [] } = useEntities('habitLog');
  const [showArchived, setShowArchived] = useState(false);
  const today = localDateKey();
  const week = lastNDays(7, today);

  const list = useMemo(
    () => (habits ?? []).filter((h) => showArchived || !h.archived).sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name)),
    [habits, showArchived],
  );
  const archivedCount = (habits ?? []).filter((h) => h.archived).length;

  const increment = async (h: Habit) => {
    try {
      const log = await createEntity('habitLog', { habitId: h.id, date: today, value: 1 });
      const after = habitPeriodProgress(h, [...logs, log], today);
      if (after >= h.target && after - 1 < h.target) haptics.success();
      else haptics.light();
      toast.success(`${h.name}: ${after}/${h.target}${h.unit ? ` ${h.unit}` : ''}`, { label: 'Undo', onPress: () => void deleteEntity('habitLog', log.id).catch(() => toast.error('Could not undo')) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not log');
    }
  };

  if (isLoading) return <LoadingState compact />;
  if (list.length === 0 && archivedCount === 0) {
    return (
      <EmptyState
        icon="checkmark-done-outline"
        title="Build your first habit"
        body="Small daily wins add up. Track meditation, reading, workouts — anything."
        actionLabel="Create habit"
        onAction={() => router.push('/habits/new')}
      />
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {list.map((h, i) => {
        const totals = habitDailyTotals(logs, h.id);
        const progress = habitPeriodProgress(h, logs, today);
        const streak = habitStreak(h, logs, today);
        const done = progress >= h.target;
        const color = h.color ?? colors.categorical[i % colors.categorical.length]!;
        return (
          <Animated.View key={h.id} entering={FadeInDown.delay(i * 30).duration(220)} layout={LinearTransition}>
            <Card onPress={() => router.push(`/habits/${h.id}`)} accessibilityLabel={`${h.name}, ${progress} of ${h.target}${done ? ', done' : ''}. Open habit`} style={{ opacity: h.archived ? 0.6 : 1 }}>
              <View style={styles.row}>
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Icon name={(h.icon ?? 'checkmark-circle-outline') as IconName} size={18} color={color} />
                    <Text variant="subheading" numberOfLines={1} style={{ flex: 1 }}>
                      {h.name}
                    </Text>
                  </View>
                  <Text variant="small" color="textMuted">
                    {progress}/{h.target}
                    {h.unit ? ` ${h.unit}` : ''} {h.frequency === 'weekly' ? 'this week' : 'today'}
                    {streak > 0 ? `  ·  🔥 ${streak} ${h.frequency === 'weekly' ? 'wk' : 'day'} streak` : ''}
                    {h.archived ? '  ·  archived' : ''}
                  </Text>
                  {h.frequency === 'daily' ? <WeekDots met={week.map((d) => (totals.get(d) ?? 0) >= h.target)} /> : null}
                </View>
                {!h.archived ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Log one ${h.unit ?? 'time'} for ${h.name}`}
                    onPress={() => void increment(h)}
                    hitSlop={8}
                  >
                    <ProgressRing value={progress / h.target} size={56} stroke={6} color={color}>
                      <Icon name={done ? 'checkmark' : 'add'} size={24} color={done ? colors.success : color} />
                    </ProgressRing>
                  </Pressable>
                ) : null}
              </View>
            </Card>
          </Animated.View>
        );
      })}
      {archivedCount > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => setShowArchived((v) => !v)} style={{ alignSelf: 'center', padding: 12 }}>
          <Text variant="caption" color="primary" weight="600">
            {showArchived ? 'Hide archived' : `Show ${archivedCount} archived`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
