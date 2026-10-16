import { View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Goal } from '@aura/shared';
import { Badge, Button, Card, EmptyState, LoadingState, ProgressBar, Text } from '@/components/ui';
import { useEntities } from '@/lib/data';
import { relativeDay } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';

const KIND_LABEL: Record<Goal['kind'], string> = { personal: 'Personal', financial: 'Money', fitness: 'Fitness', learning: 'Learning' };

export function goalProgress(g: Goal): number | null {
  return g.targetValue && g.targetValue > 0 ? g.currentValue / g.targetValue : null;
}

export function GoalsSection() {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: goals, isLoading } = useEntities('goal');
  if (isLoading) return <LoadingState compact />;
  const list = [...(goals ?? [])].sort((a, b) => (a.status === b.status ? (a.deadline ?? '9').localeCompare(b.deadline ?? '9') : a.status === 'active' ? -1 : 1));
  if (list.length === 0) {
    return <EmptyState icon="flag-outline" title="Set a goal" body="Save for something, run a 10K, learn a skill — track progress here." actionLabel="New goal" onAction={() => router.push('/goals/new')} />;
  }
  return (
    <View style={{ gap: 12 }}>
      <Button title="New goal" icon="add" size="sm" variant="soft" onPress={() => router.push('/goals/new')} style={{ alignSelf: 'flex-start' }} />
      {list.map((g, i) => {
        const p = goalProgress(g);
        return (
          <Animated.View key={g.id} entering={FadeInDown.delay(i * 30).duration(220)}>
            <Card onPress={() => router.push(`/goals/${g.id}`)} accessibilityLabel={`${g.title}${p != null ? `, ${Math.round(p * 100)} percent` : ''}. Open goal`} style={{ gap: 8, opacity: g.status === 'abandoned' ? 0.6 : 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text variant="subheading" style={{ flex: 1 }} numberOfLines={2}>
                  {g.title}
                </Text>
                <Badge label={g.status === 'achieved' ? 'Achieved 🎉' : g.status === 'abandoned' ? 'Abandoned' : KIND_LABEL[g.kind]} tone={g.status === 'achieved' ? 'success' : 'primary'} />
              </View>
              {p != null ? <ProgressBar value={p} color={g.status === 'achieved' ? colors.success : undefined} label={`${g.title} progress`} /> : null}
              <Text variant="small" color="textMuted">
                {g.targetValue != null ? `${g.currentValue} / ${g.targetValue}${g.unit ? ` ${g.unit}` : ''}` : `${g.currentValue}${g.unit ? ` ${g.unit}` : ''}`}
                {g.deadline ? `  ·  by ${relativeDay(g.deadline)}` : ''}
              </Text>
            </Card>
          </Animated.View>
        );
      })}
    </View>
  );
}
