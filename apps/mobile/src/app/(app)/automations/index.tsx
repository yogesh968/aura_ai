import { Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Automation, AutomationSuggestion } from '@aura/shared';
import { Button, Card, EmptyState, ErrorState, IconButton, LoadingState, Screen, ScreenHeader, SectionHeader, StaleBanner, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { endpoints } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/client';
import { useCachedQuery } from '@/lib/data';
import { useOnline } from '@/lib/network';
import { formatDateTime, timeAgo } from '@/lib/format';
import { toast } from '@/lib/toast';
import { describeTrigger } from '@/features/workspace/automations';

function AutomationCard({ a, onToggle, busy }: { a: Automation; onToggle: (v: boolean) => void; busy: boolean }) {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Card onPress={() => router.push(`/automations/${a.id}`)} accessibilityLabel={`${a.name}, ${describeTrigger(a.trigger)}, ${a.enabled ? 'on' : 'off'}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {a.name}
          </Text>
          <Text variant="small" color="textMuted">
            {describeTrigger(a.trigger)} · {a.steps.length} step{a.steps.length === 1 ? '' : 's'}
          </Text>
          <Text variant="small" color="textSubtle">
            {a.enabled && a.nextRunAt ? `Next: ${formatDateTime(a.nextRunAt)}` : a.enabled ? 'Runs when you tap Run now' : 'Paused'}
            {a.lastRunAt ? ` · Last run ${timeAgo(a.lastRunAt)}` : ''}
          </Text>
        </View>
        <Switch
          value={a.enabled}
          onValueChange={onToggle}
          disabled={busy}
          accessibilityLabel={`${a.enabled ? 'Pause' : 'Enable'} ${a.name}`}
          trackColor={{ true: colors.primary, false: colors.border }}
          thumbColor={colors.surface}
        />
      </View>
    </Card>
  );
}

export default function AutomationsScreen() {
  const router = useRouter();
  const online = useOnline();
  const qc = useQueryClient();
  const list = useCachedQuery(['automations'], () => endpoints.automations.list());
  const suggestions = useQuery({ queryKey: ['automation-suggestions'], queryFn: () => endpoints.automations.suggestions(), enabled: online });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => endpoints.automations.update(id, { enabled }),
    onSuccess: (a) => {
      void qc.invalidateQueries({ queryKey: ['automations'] });
      toast.success(a.enabled ? `“${a.name}” is on` : `“${a.name}” paused`);
    },
    onError: (e) => toast.error(errorMessage(e, 'Could not update')),
  });

  const add = useMutation({
    mutationFn: (s: AutomationSuggestion) => endpoints.automations.create(s.automation),
    onSuccess: (a) => {
      void qc.invalidateQueries({ queryKey: ['automations'] });
      void qc.invalidateQueries({ queryKey: ['automation-suggestions'] });
      toast.success(`Added “${a.name}”`);
    },
    onError: (e) => toast.error(errorMessage(e, 'Could not add')),
  });

  const items = list.data?.data ?? [];

  return (
    <Screen
      header={
        <ScreenHeader
          title="Automations"
          subtitle="Routines Aura runs for you"
          right={<IconButton icon="time-outline" label="Run history" onPress={() => router.push('/automations/history')} />}
        />
      }
      refreshing={list.isRefetching}
      onRefresh={() => {
        void list.refetch();
        void suggestions.refetch();
      }}
      footer={
        <View style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
          <Button title="New automation" icon="add" disabled={!online} onPress={() => router.push('/automations/new')} fullWidth />
        </View>
      }
    >
      <StaleBanner cachedAt={list.data?.cachedAt} />
      <Text variant="small" color="textMuted" style={{ marginBottom: 12 }}>
        Automations run on the server with safe, reversible actions only (never deleting data or sending messages). Every run is logged in history.
      </Text>
      {list.isLoading ? (
        <LoadingState compact />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon="flash-outline" title="No automations yet" body="Get a morning briefing, habit nudges or a weekly money check without lifting a finger." compact />
      ) : (
        <View style={{ gap: 10 }}>
          {items.map((a) => (
            <AutomationCard key={a.id} a={a} busy={toggle.isPending || !online} onToggle={(enabled) => toggle.mutate({ id: a.id, enabled })} />
          ))}
        </View>
      )}

      {online && (suggestions.data?.length ?? 0) > 0 ? (
        <>
          <SectionHeader title="Suggested for you" />
          <View style={{ gap: 10 }}>
            {suggestions.data!.map((s) => (
              <Card key={s.name} tone="primary">
                <Text variant="bodyStrong">{s.name}</Text>
                <Text variant="caption" color="textMuted" style={{ marginTop: 4 }}>
                  {s.reason}
                </Text>
                <Text variant="small" color="textSubtle" style={{ marginTop: 4 }}>
                  {describeTrigger(s.automation.trigger)}
                </Text>
                <Button
                  title="Add"
                  size="sm"
                  icon="add"
                  variant="soft"
                  loading={add.isPending && add.variables?.name === s.name}
                  disabled={add.isPending}
                  onPress={() => add.mutate(s)}
                  style={{ marginTop: 10, alignSelf: 'flex-start' }}
                />
              </Card>
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}
