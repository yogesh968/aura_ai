import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Avatar, Badge, Card, Icon, Screen, SectionHeader, Text, type IconName } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuthStore } from '@/lib/auth/store';
import { useSyncStore } from '@/lib/sync/engine';
import { useOnline } from '@/lib/network';
import { timeAgo } from '@/lib/format';
import { haptics } from '@/lib/haptics';

interface HubItem {
  label: string;
  icon: IconName;
  href: string;
  hint: string;
}

const KNOWLEDGE: HubItem[] = [
  { label: 'Notes', icon: 'document-text-outline', href: '/notes', hint: 'Ideas and lists' },
  { label: 'Documents', icon: 'folder-open-outline', href: '/documents', hint: 'PDFs, scans, images' },
  { label: 'Search', icon: 'search-outline', href: '/search', hint: 'Everything you saved' },
  { label: 'Journal', icon: 'journal-outline', href: '/journal', hint: 'Reflect on your day' },
];

const PLAN: HubItem[] = [
  { label: 'Projects', icon: 'briefcase-outline', href: '/projects', hint: 'Plans and progress' },
  { label: 'Routines', icon: 'repeat-outline', href: '/routines', hint: 'Daily rhythms' },
  { label: 'Finance', icon: 'wallet-outline', href: '/finance', hint: 'Money and bills' },
  { label: 'Automations', icon: 'flash-outline', href: '/automations', hint: 'Run on a schedule' },
];

const ASSIST: HubItem[] = [
  { label: 'Tools', icon: 'construct-outline', href: '/tools', hint: 'Calculator, translate…' },
  { label: 'Pending actions', icon: 'shield-checkmark-outline', href: '/actions', hint: 'Waiting for your OK' },
  { label: 'Inbox', icon: 'notifications-outline', href: '/inbox', hint: 'Automation updates' },
  { label: 'Settings', icon: 'settings-outline', href: '/settings', hint: 'Preferences & privacy' },
];

function Tile({ item, index }: { item: HubItem; index: number }) {
  const { colors, radius } = useTheme();
  const router = useRouter();
  return (
    <Animated.View entering={FadeInDown.duration(220).delay(index * 30)} style={styles.tileWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.label}. ${item.hint}`}
        onPress={() => {
          haptics.tap();
          router.push(item.href as never);
        }}
        style={({ pressed }) => [
          styles.tile,
          { backgroundColor: pressed ? colors.surfacePressed : colors.surface, borderColor: colors.border, borderRadius: radius.lg },
        ]}
      >
        <View style={[styles.tileIcon, { backgroundColor: colors.primarySoft }]}>
          <Icon name={item.icon} size={20} color="primary" />
        </View>
        <Text variant="bodyStrong" numberOfLines={1}>
          {item.label}
        </Text>
        <Text variant="small" color="textMuted" numberOfLines={1}>
          {item.hint}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function Grid({ items, offset }: { items: HubItem[]; offset: number }) {
  return (
    <View style={styles.grid}>
      {items.map((item, i) => (
        <Tile key={item.href} item={item} index={offset + i} />
      ))}
    </View>
  );
}

function SyncLine() {
  const { status, lastSyncedAt, pending } = useSyncStore();
  const online = useOnline();
  const router = useRouter();
  const label = !online
    ? `Offline${pending ? ` · ${pending} change${pending === 1 ? '' : 's'} waiting to sync` : ''}`
    : status === 'syncing'
      ? 'Syncing…'
      : status === 'error'
        ? 'Sync problem — tap for details'
        : lastSyncedAt
          ? `Synced ${timeAgo(lastSyncedAt)}${pending ? ` · ${pending} pending` : ''}`
          : 'Not synced yet';
  const icon: IconName = !online ? 'cloud-offline-outline' : status === 'error' ? 'warning-outline' : status === 'syncing' ? 'sync-outline' : 'cloud-done-outline';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Sync status: ${label}`} onPress={() => router.push('/settings/sync')} style={styles.syncLine} hitSlop={8}>
      <Icon name={icon} size={16} color={status === 'error' ? 'warning' : 'textMuted'} />
      <Text variant="small" color={status === 'error' ? 'warning' : 'textMuted'}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function MoreScreen() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  return (
    <Screen tabBarInset>
      <Text variant="title" accessibilityRole="header" style={{ marginTop: 8 }}>
        More
      </Text>
      <Card onPress={() => router.push('/settings/account')} accessibilityLabel="Account" style={{ marginTop: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar name={user?.name ?? 'Guest'} size={48} />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text variant="subheading" numberOfLines={1} style={{ flexShrink: 1 }}>
                {user?.name ?? 'Guest'}
              </Text>
              {user?.isGuest ? <Badge label="Guest" tone="warning" /> : null}
            </View>
            <Text variant="small" color="textMuted" numberOfLines={1}>
              {user?.isGuest ? 'Create an account to keep your data safe' : (user?.email ?? '')}
            </Text>
          </View>
          <Icon name="chevron-forward" size={18} color="textSubtle" />
        </View>
      </Card>
      <SyncLine />
      <SectionHeader title="Knowledge" />
      <Grid items={KNOWLEDGE} offset={0} />
      <SectionHeader title="Plan & money" />
      <Grid items={PLAN} offset={4} />
      <SectionHeader title="Assistant" />
      <Grid items={ASSIST} offset={8} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 },
  tileWrap: { width: '50%', padding: 6 },
  tile: { padding: 14, gap: 4, borderWidth: StyleSheet.hairlineWidth, minHeight: 112 },
  tileIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  syncLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, minHeight: 32 },
});
