import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, Divider, EmptyState, Icon, LoadingState, Screen, ScreenHeader, SectionHeader, Text } from '@/components/ui';
import { recentSyncLog } from '@/lib/db/repo';
import { useOnline } from '@/lib/network';
import { resetSyncCursor, syncNow, useSyncStore } from '@/lib/sync/engine';
import { timeAgo } from '@/lib/format';
import { toast } from '@/lib/toast';

export default function SyncScreen() {
  const sync = useSyncStore();
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const log = useQuery({ queryKey: ['sync-log', sync.lastSyncedAt, sync.conflicts], queryFn: () => recentSyncLog(50) });

  const run = async (full: boolean) => {
    setBusy(true);
    try {
      const conflictsBefore = useSyncStore.getState().conflicts;
      if (full) await resetSyncCursor();
      await syncNow();
      const st = useSyncStore.getState();
      if (st.status === 'offline') toast.info("You're offline — changes will sync when you reconnect.");
      else if (st.status === 'error') toast.error(st.lastError ?? 'Sync failed');
      else if (st.pending > 0) {
        // Changes the server keeps rejecting stay queued; don't call that "synced".
        toast.error(`${st.pending} change${st.pending === 1 ? '' : 's'} couldn't be uploaded. See the log below.`);
      } else if (st.conflicts > conflictsBefore) toast.info('Synced, with conflicts — see the log below.');
      else toast.success(full ? 'Everything re-downloaded' : 'Synced');
    } finally {
      setBusy(false);
    }
  };

  const statusText =
    !online || sync.status === 'offline'
      ? 'Offline — changes are saved on this phone'
      : sync.status === 'syncing'
        ? 'Syncing…'
        : sync.status === 'error'
          ? `Last sync failed: ${sync.lastError ?? 'unknown error'}`
          : sync.lastSyncedAt
            ? `Up to date · last synced ${timeAgo(sync.lastSyncedAt)}`
            : 'Not synced yet';
  const tone = !online || sync.status === 'offline' ? 'warning' : sync.status === 'error' ? 'danger' : 'success';

  return (
    <Screen header={<ScreenHeader title="Sync" />} refreshing={log.isRefetching} onRefresh={() => void log.refetch()}>
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name={tone === 'success' ? 'cloud-done-outline' : tone === 'danger' ? 'alert-circle-outline' : 'cloud-offline-outline'} size={24} color={tone} />
          <Text variant="body" style={{ flex: 1 }} accessibilityLiveRegion="polite">
            {statusText}
          </Text>
        </View>
        <Text variant="caption" color="textMuted">
          {sync.pending > 0 ? `${sync.pending} local change${sync.pending === 1 ? '' : 's'} waiting to upload.` : 'No local changes waiting.'}
        </Text>
        <Button title="Sync now" icon="sync" loading={busy && sync.status === 'syncing'} disabled={busy} onPress={() => void run(false)} />
      </Card>

      <SectionHeader title="How sync works" />
      <Card tone="alt" style={{ gap: 6 }}>
        <Text variant="caption" color="textMuted">
          Everything you create is saved on this phone first, so it works offline, and is uploaded when you are connected. If the same item was changed on two devices, the most recent edit wins and the other one is listed below.
        </Text>
      </Card>

      <SectionHeader title="Recent conflicts & issues" />
      <Card padded={false} style={{ paddingHorizontal: 12 }}>
        {log.isLoading ? (
          <LoadingState compact />
        ) : (log.data ?? []).length === 0 ? (
          <EmptyState icon="checkmark-done-outline" title="No conflicts" body="Your devices agree with each other." compact />
        ) : (
          (log.data ?? []).map((e, i) => (
            <View key={e.id}>
              {i > 0 ? <Divider /> : null}
              <View style={{ paddingVertical: 12, gap: 4 }}>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <Badge label={e.status === 'conflict' ? 'Conflict' : 'Not saved'} tone={e.status === 'conflict' ? 'warning' : 'danger'} />
                  <Text variant="small" color="textSubtle">{`${e.type} · ${timeAgo(e.created_at)}`}</Text>
                </View>
                <Text variant="caption">{e.message}</Text>
              </View>
            </View>
          ))
        )}
      </Card>

      <SectionHeader title="Troubleshooting" />
      <Button
        title="Re-download everything"
        variant="secondary"
        icon="cloud-download-outline"
        disabled={busy}
        onPress={() =>
          Alert.alert('Re-download everything?', 'AURA will fetch all your data from the server again. Unsynced local changes are kept and uploaded first.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Re-download', onPress: () => void run(true) },
          ])
        }
      />
    </Screen>
  );
}
