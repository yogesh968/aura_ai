import { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Routine } from '@aura/shared';
import { Badge, Card, EmptyState, Fab, IconButton, LoadingState, Screen, ScreenHeader, Text } from '@/components/ui';
import { useEntities } from '@/lib/data';
import { updateEntity } from '@/lib/db/repo';
import { toast } from '@/lib/toast';
import { daysLabel } from '@/features/life/components';

const ORDER: Record<Routine['timeOfDay'], number> = { morning: 0, afternoon: 1, evening: 2, night: 3 };
const LABEL: Record<Routine['timeOfDay'], string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', night: 'Night' };

export default function RoutinesScreen() {
  const router = useRouter();
  const { data, isLoading } = useEntities('routine');
  const routines = useMemo(() => [...(data ?? [])].sort((a, b) => ORDER[a.timeOfDay] - ORDER[b.timeOfDay] || (a.time ?? '').localeCompare(b.time ?? '')), [data]);

  const toggle = async (r: Routine) => {
    try {
      await updateEntity('routine', r.id, { active: !r.active });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update');
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen header={<ScreenHeader title="Routines" subtitle="Repeatable checklists for your day" />}>
        {isLoading ? <LoadingState /> : null}
        {!isLoading && routines.length === 0 ? (
          <EmptyState icon="repeat-outline" title="No routines yet" body="Create a morning or evening routine — Aura can nudge you when it starts." actionLabel="Create routine" onAction={() => router.push('/routines/new')} />
        ) : null}
        <View style={{ gap: 12 }}>
          {routines.map((r, i) => (
            <Animated.View key={r.id} entering={FadeInDown.delay(i * 30).duration(200)}>
              <Card onPress={() => router.push(`/routines/${r.id}`)} accessibilityLabel={`${r.name} routine. Open`} style={{ gap: 6, opacity: r.active ? 1 : 0.6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text variant="subheading" style={{ flex: 1 }}>
                    {r.name}
                  </Text>
                  <Badge label={`${LABEL[r.timeOfDay]}${r.time ? ` · ${r.time}` : ''}`} tone="primary" />
                  <IconButton icon={r.active ? 'pause-circle-outline' : 'play-circle-outline'} label={r.active ? 'Pause routine' : 'Resume routine'} onPress={() => void toggle(r)} />
                </View>
                <Text variant="small" color="textMuted">
                  {daysLabel(r.days)} · {r.steps.length} step{r.steps.length === 1 ? '' : 's'}
                  {r.active ? '' : ' · paused'}
                </Text>
                {r.steps.length ? (
                  <Text variant="caption" color="textMuted" numberOfLines={2}>
                    {r.steps.join(' → ')}
                  </Text>
                ) : null}
              </Card>
            </Animated.View>
          ))}
        </View>
      </Screen>
      <Fab label="New routine" onPress={() => router.push('/routines/new')} bottom={32} />
    </View>
  );
}
