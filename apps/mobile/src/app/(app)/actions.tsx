import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { PendingAction } from '@aura/shared';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, Screen, ScreenHeader, Segmented, Text } from '@/components/ui';
import { endpoints } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/client';
import { queryClient } from '@/lib/data';
import { timeAgo } from '@/lib/format';
import { useOnline } from '@/lib/network';
import { toast } from '@/lib/toast';
import { haptics } from '@/lib/haptics';
import { decisionMessage, expiresIn } from '@/features/assistant/actionText';

const STATUS: Record<PendingAction['status'], { label: string; tone: 'warning' | 'success' | 'danger' | 'default' }> = {
  pending: { label: 'Waiting', tone: 'warning' },
  confirmed: { label: 'Done', tone: 'success' },
  rejected: { label: 'Cancelled', tone: 'default' },
  expired: { label: 'Expired', tone: 'default' },
  failed: { label: 'Failed', tone: 'danger' },
};

/** Actions the assistant proposed that need the user's explicit confirmation. */
export default function ActionsScreen() {
  const online = useOnline();
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [busy, setBusy] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['actions', filter], queryFn: () => endpoints.actions.list(filter), enabled: online });

  const decide = async (a: PendingAction, kind: 'confirm' | 'reject') => {
    setBusy(`${a.id}:${kind}`);
    try {
      const res = kind === 'confirm' ? await endpoints.actions.confirm(a.id) : await endpoints.actions.reject(a.id);
      const msg = decisionMessage(res.status, res.result);
      if (msg.kind === 'success') haptics.success();
      toast[msg.kind](msg.text);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
      void queryClient.invalidateQueries({ queryKey: ['actions'] });
    }
  };

  return (
    <Screen header={<ScreenHeader title="Confirmations" />} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <Text variant="caption" color="textMuted" style={{ marginBottom: 12 }}>
        Deleting things and saving memories always need your OK. Nothing here runs until you confirm.
      </Text>
      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'pending', label: 'Waiting' },
          { value: 'all', label: 'History' },
        ]}
      />
      <View style={{ height: 12 }} />
      {!online ? (
        <EmptyState icon="cloud-offline-outline" title="You're offline" body="Confirmations need a connection." />
      ) : q.isLoading ? (
        <LoadingState compact />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState icon="shield-checkmark-outline" title={filter === 'pending' ? 'Nothing waiting' : 'No history yet'} body="When Aura proposes something that needs your approval, it shows up here." />
      ) : (
        <View style={{ gap: 12 }}>
          {q.data.map((a) => (
            <Card key={a.id} tone={a.status === 'pending' ? 'warning' : 'default'} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text variant="subheading" style={{ flex: 1 }}>
                  {a.label}
                </Text>
                <Badge label={STATUS[a.status].label} tone={STATUS[a.status].tone} />
              </View>
              <Text variant="body">{a.description}</Text>
              {a.result && a.status !== 'pending' ? (
                <Text variant="caption" color="textMuted">
                  {a.result}
                </Text>
              ) : null}
              <Text variant="small" color="textSubtle">
                {timeAgo(a.createdAt)}
                {a.status === 'pending' ? ` · expires ${expiresIn(a.expiresAt)}` : ''}
              </Text>
              {a.status === 'pending' ? (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button title="Confirm" size="sm" icon="checkmark" loading={busy === `${a.id}:confirm`} disabled={busy !== null} onPress={() => void decide(a, 'confirm')} style={{ flex: 1 }} />
                  <Button title="Cancel" size="sm" variant="secondary" loading={busy === `${a.id}:reject`} disabled={busy !== null} onPress={() => void decide(a, 'reject')} style={{ flex: 1 }} />
                </View>
              ) : null}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
