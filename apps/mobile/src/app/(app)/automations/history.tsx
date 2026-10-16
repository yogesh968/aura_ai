import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, ScreenHeader, Text } from '@/components/ui';
import { endpoints } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/client';
import { useOnline } from '@/lib/network';
import { formatDateTime } from '@/lib/format';
import { toast } from '@/lib/toast';
import { RunStatusBadge, RunSteps } from '@/features/workspace/automations';

const TRIGGER_LABEL = { schedule: 'Scheduled', manual: 'Run manually', retry: 'Retry' } as const;

export default function AutomationHistoryScreen() {
  const { automationId } = useLocalSearchParams<{ automationId?: string }>();
  const online = useOnline();
  const qc = useQueryClient();
  const runs = useQuery({
    queryKey: ['automation-runs', automationId ?? 'all'],
    queryFn: () => endpoints.automations.runs(automationId),
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === 'running' || r.status === 'queued') ? 4000 : false),
  });

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'cancel' | 'retry' }) => (action === 'cancel' ? endpoints.automations.cancelRun(id) : endpoints.automations.retryRun(id)),
    onSuccess: (run, v) => {
      void qc.invalidateQueries({ queryKey: ['automation-runs'] });
      void qc.invalidateQueries({ queryKey: ['automations'] });
      toast.success(v.action === 'cancel' ? (run.status === 'cancelled' ? 'Run cancelled' : 'Cancelling after the current step…') : `Retry ${run.status === 'succeeded' ? 'succeeded' : `finished: ${run.status}`}`);
    },
    onError: (e) => toast.error(errorMessage(e, 'Action failed')),
  });

  return (
    <Screen header={<ScreenHeader title="Run history" subtitle="What your automations did" />} refreshing={runs.isRefetching} onRefresh={() => void runs.refetch()}>
      {runs.isLoading ? (
        <LoadingState compact />
      ) : runs.error ? (
        <ErrorState error={runs.error} onRetry={() => void runs.refetch()} />
      ) : (runs.data ?? []).length === 0 ? (
        <EmptyState icon="time-outline" title="No runs yet" body="When an automation runs — on schedule or when you tap Run now — each step's result shows up here." />
      ) : (
        <View style={{ gap: 10 }}>
          {runs.data!.map((r) => (
            <Card key={r.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                  {r.automationName || 'Automation'}
                </Text>
                <RunStatusBadge status={r.status} />
              </View>
              <Text variant="small" color="textMuted" style={{ marginTop: 2 }}>
                {TRIGGER_LABEL[r.trigger]}
                {r.attempt > 1 ? ` · attempt ${r.attempt}` : ''} · {formatDateTime(r.startedAt ?? r.createdAt)}
              </Text>
              <RunSteps run={r} />
              {r.status === 'queued' || r.status === 'running' ? (
                <Button
                  title="Cancel"
                  size="sm"
                  variant="secondary"
                  icon="stop-circle-outline"
                  disabled={!online || act.isPending}
                  onPress={() => act.mutate({ id: r.id, action: 'cancel' })}
                  style={{ marginTop: 10, alignSelf: 'flex-start' }}
                />
              ) : ['failed', 'partial', 'cancelled'].includes(r.status) ? (
                <Button
                  title="Retry"
                  size="sm"
                  variant="soft"
                  icon="refresh"
                  loading={act.isPending && act.variables?.id === r.id}
                  disabled={!online || act.isPending}
                  onPress={() => act.mutate({ id: r.id, action: 'retry' })}
                  style={{ marginTop: 10, alignSelf: 'flex-start' }}
                />
              ) : null}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
