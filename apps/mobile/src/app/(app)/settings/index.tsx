import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useQuery } from '@tanstack/react-query';
import type { Preferences } from '@aura/shared';
import { Avatar, Badge, Card, Divider, ListItem, Screen, ScreenHeader, SectionHeader, Segmented, Text } from '@/components/ui';
import { endpoints } from '@/lib/api/endpoints';
import { getApiBaseUrl } from '@/lib/api/config';
import { useAuthStore } from '@/lib/auth/store';
import { useSettingsStore } from '@/lib/settings';
import { useSyncStore } from '@/lib/sync/engine';
import { timeAgo } from '@/lib/format';
import { toast } from '@/lib/toast';
import { flushPendingPreferences, hasPendingPreferences, savePreferences } from '@/features/account/prefs';

export default function SettingsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const theme = useSettingsStore((s) => s.preferences.theme);
  const sync = useSyncStore();
  const [pendingPrefs, setPendingPrefs] = useState(false);
  const health = useQuery({ queryKey: ['health', getApiBaseUrl()], queryFn: endpoints.health, staleTime: 60_000, retry: false });

  // Retry preference changes that were made offline.
  useEffect(() => {
    (async () => {
      if (await hasPendingPreferences()) {
        const done = await flushPendingPreferences();
        setPendingPrefs(!done);
        if (done) toast.success('Offline preference changes synced');
      }
    })();
  }, []);

  const setTheme = async (value: Preferences['theme']) => {
    try {
      await savePreferences({ theme: value });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change the theme");
    }
  };

  const syncSubtitle =
    sync.status === 'syncing'
      ? 'Syncing…'
      : sync.pending > 0
        ? `${sync.pending} change${sync.pending === 1 ? '' : 's'} waiting to sync`
        : sync.lastSyncedAt
          ? `Up to date · ${timeAgo(sync.lastSyncedAt)}`
          : 'Not synced yet';

  return (
    <Screen header={<ScreenHeader title="Settings" />}>
      <Card onPress={() => router.push('/settings/account')} accessibilityLabel="Your account" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar name={user?.name ?? 'Guest'} size={52} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="subheading" numberOfLines={1}>
            {user?.name ?? 'Guest'}
          </Text>
          {user?.isGuest ? <Badge label="Guest account — tap to upgrade" tone="warning" /> : <Text variant="caption" color="textMuted">{user?.email ?? ''}</Text>}
        </View>
      </Card>

      {pendingPrefs ? (
        <Card tone="warning" style={{ marginTop: 12 }}>
          <Text variant="caption">Some preference changes are saved on this phone and will be sent to the server when you are online.</Text>
        </Card>
      ) : null}

      <SectionHeader title="Assistant" />
      <Card padded={false} style={{ paddingHorizontal: 12 }}>
        <ListItem icon="sparkles-outline" title="Assistant & preferences" subtitle="Name, language, voice, briefings, targets" chevron onPress={() => router.push('/settings/assistant')} />
        <Divider inset={52} />
        <ListItem icon="bulb-outline" title="Memory" subtitle="What AURA remembers about you" chevron onPress={() => router.push('/settings/memory')} />
      </Card>

      <SectionHeader title="Privacy & device" />
      <Card padded={false} style={{ paddingHorizontal: 12 }}>
        <ListItem icon="shield-checkmark-outline" title="Privacy & data" subtitle="Export, sign out, delete account, activity log" chevron onPress={() => router.push('/settings/privacy')} />
        <Divider inset={52} />
        <ListItem icon="apps-outline" title="Integrations & permissions" subtitle="Notifications, mic, calendar, contacts, location" chevron onPress={() => router.push('/settings/integrations')} />
        <Divider inset={52} />
        <ListItem icon="sync-outline" title="Sync" subtitle={syncSubtitle} chevron onPress={() => router.push('/settings/sync')} />
        <Divider inset={52} />
        <ListItem icon="server-outline" title="Server" subtitle={getApiBaseUrl()} chevron onPress={() => router.push('/settings/server')} />
      </Card>

      <SectionHeader title="Appearance" />
      <Segmented
        options={[
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
        value={theme}
        onChange={setTheme}
      />

      <SectionHeader title="About" />
      <Card style={{ gap: 6 }}>
        <Text variant="body">{`AURA AI ${Constants.expoConfig?.version ?? ''}`}</Text>
        <Text variant="caption" color="textMuted">
          {health.isLoading
            ? 'Checking server…'
            : health.data
              ? `Server v${health.data.version} · AI ${health.data.ai.available ? `ready (${health.data.ai.model ?? health.data.ai.provider})` : 'not configured'} · Web search ${health.data.features.webSearch ? 'on' : 'off'}`
              : 'Server unreachable right now — offline features still work.'}
        </Text>
        <Text variant="small" color="textSubtle">
          General guidance only — not medical, legal or financial advice.
        </Text>
      </Card>
    </Screen>
  );
}
