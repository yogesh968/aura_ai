import { useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  Icon,
  ListItem,
  LoadingState,
  Screen,
  ScreenHeader,
  SectionHeader,
  Sheet,
  Text,
  TextField,
} from '@/components/ui';
import { endpoints } from '@/lib/api/endpoints';
import { errorMessage, isNetworkError } from '@/lib/api/client';
import { useSyncStore, syncNow } from '@/lib/sync/engine';
import { timeAgo } from '@/lib/format';
import { toast } from '@/lib/toast';
import { toolLabel } from '@aura/shared';
import { deleteAccountEverywhere, exportAllData, signOutAndClean } from '@/features/account/session';

export default function PrivacyScreen() {
  const pending = useSyncStore((s) => s.pending);
  const [busy, setBusy] = useState<'export' | 'signout' | 'all' | 'delete' | 'sync' | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [showLog, setShowLog] = useState(false);
  const log = useQuery({ queryKey: ['tool-executions'], queryFn: endpoints.tools.executions, enabled: showLog });

  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const doExport = () =>
    run('export', async () => {
      const r = await exportAllData();
      if (r === 'saved') toast.info('Export created, but sharing is not available on this device.');
    });

  const doSignOut = (everywhere: boolean) => {
    const proceed = () => run(everywhere ? 'all' : 'signout', () => signOutAndClean({ everywhere }));
    const title = everywhere ? 'Sign out of all devices?' : 'Sign out?';
    const base = everywhere ? 'Every phone signed in to this account will need to sign in again.' : 'Your data stays in your account; it is removed from this phone.';
    if (pending > 0) {
      Alert.alert(title, `${base}\n\n${pending} change${pending === 1 ? " hasn't" : "s haven't"} synced yet and will be lost.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sync first',
          onPress: () =>
            void run('sync', async () => {
              await syncNow();
              const left = useSyncStore.getState().pending;
              if (left > 0) toast.error(`${left} change${left === 1 ? '' : 's'} still couldn't sync. Check your connection.`);
              else toast.success('All changes synced — you can sign out safely.');
            }),
        },
        { text: 'Sign out anyway', style: 'destructive', onPress: () => void proceed() },
      ]);
    } else {
      Alert.alert(title, base, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: () => void proceed() },
      ]);
    }
  };

  const doDelete = () =>
    run('delete', async () => {
      try {
        await deleteAccountEverywhere();
      } catch (e) {
        if (isNetworkError(e)) throw new Error('You need to be online to delete your account.');
        throw e;
      }
    });

  return (
    <Screen header={<ScreenHeader title="Privacy & data" />}>
      <SectionHeader title="How your data is used" />
      <Card style={{ gap: 10 }}>
        <Row icon="phone-portrait-outline" text="Your tasks, notes, habits and money entries are stored on this phone and synced to your AURA server." />
        <Row icon="sparkles-outline" text="When you use AI features, your message, attached files and relevant memories are sent through your server to its AI provider. Nothing is sent to the AI otherwise." />
        <Row icon="hand-left-outline" text="Sensitive actions (deleting, saving memories) always wait for your confirmation. AURA never sends messages or moves money." />
      </Card>

      <SectionHeader title="Your data" />
      <Card padded={false} style={{ paddingHorizontal: 12 }}>
        <ListItem icon="download-outline" title="Export all data" subtitle="A JSON file with everything in your account" onPress={doExport} right={busy === 'export' ? <ActivityIndicator /> : undefined} />
        <Divider inset={52} />
        <ListItem icon="list-outline" title="Assistant activity log" subtitle="Every action AURA took for you" chevron onPress={() => setShowLog(true)} />
      </Card>

      <SectionHeader title="Session" />
      <Card style={{ gap: 10 }}>
        {pending > 0 ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Icon name="cloud-upload-outline" size={18} color="warning" />
            <Text variant="caption" color="warning" style={{ flex: 1 }}>
              {`${pending} change${pending === 1 ? '' : 's'} not synced yet`}
            </Text>
            <Button title="Sync now" size="sm" variant="soft" loading={busy === 'sync'} onPress={() => void run('sync', () => syncNow())} />
          </View>
        ) : null}
        <Button title="Sign out" variant="secondary" icon="log-out-outline" fullWidth loading={busy === 'signout'} onPress={() => doSignOut(false)} />
        <Button title="Sign out of all devices" variant="ghost" fullWidth loading={busy === 'all'} onPress={() => doSignOut(true)} />
      </Card>

      <SectionHeader title="Danger zone" />
      <Card tone="danger" style={{ gap: 10 }}>
        <Text variant="subheading" color="danger">
          Delete account
        </Text>
        <Text variant="caption" color="textMuted">
          Permanently deletes your account and everything in it — conversations, memories, documents, automations and all your data — from the server and this phone. This cannot be undone. Consider exporting first.
        </Text>
        <Button title="Delete my account" variant="danger" icon="trash-outline" onPress={() => setDeleteOpen(true)} />
      </Card>

      <Sheet
        visible={deleteOpen}
        onClose={() => {
          setDeleteOpen(false);
          setConfirmText('');
        }}
        title="Delete account permanently"
        footer={<Button title="Delete forever" variant="danger" fullWidth disabled={confirmText.trim() !== 'DELETE'} loading={busy === 'delete'} onPress={doDelete} />}
      >
        <View style={{ gap: 12, paddingBottom: 8 }}>
          <Text variant="body">Type DELETE to confirm. Your account and all its data will be erased.</Text>
          <TextField label="Confirmation" value={confirmText} onChangeText={setConfirmText} autoCapitalize="characters" autoCorrect={false} placeholder="DELETE" />
        </View>
      </Sheet>

      <Sheet visible={showLog} onClose={() => setShowLog(false)} title="Assistant activity">
        {log.isLoading ? (
          <LoadingState compact />
        ) : log.error ? (
          <ErrorState error={log.error} onRetry={() => void log.refetch()} compact />
        ) : (log.data ?? []).length === 0 ? (
          <EmptyState icon="list-outline" title="No activity yet" body="Actions AURA takes in chat or automations will show up here." compact />
        ) : (
          (log.data ?? []).map((x) => (
            <View key={x.id} style={{ paddingVertical: 10, gap: 4 }}>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <Text variant="bodyStrong">{toolLabel(x.toolName)}</Text>
                <Badge label={x.status.replace(/_/g, ' ')} tone={x.status === 'succeeded' ? 'success' : x.status === 'failed' ? 'danger' : 'warning'} />
                <Badge label={x.source === 'automation' ? 'Automation' : 'Chat'} />
              </View>
              <Text variant="caption" color="textMuted">
                {x.summary}
              </Text>
              <Text variant="small" color="textSubtle">
                {timeAgo(x.createdAt)}
              </Text>
              <Divider />
            </View>
          ))
        )}
      </Sheet>
    </Screen>
  );
}

function Row({ icon, text }: { icon: Parameters<typeof Icon>[0]['name']; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Icon name={icon} size={18} color="primary" />
      <Text variant="caption" style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}
