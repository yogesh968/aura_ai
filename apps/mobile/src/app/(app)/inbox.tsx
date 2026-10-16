import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { InboxItem } from '@/lib/api/endpoints';
import { endpoints } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/client';
import { Button, Card, Divider, EmptyState, ErrorState, Icon, ListItem, LoadingState, Screen, ScreenHeader, StaleBanner, type IconName } from '@/components/ui';
import { queryClient, useCachedQuery } from '@/lib/data';
import { timeAgo } from '@/lib/format';
import { useOnline } from '@/lib/network';
import { toast } from '@/lib/toast';

const KIND_ICON: Record<string, IconName> = {
  briefing: 'sunny-outline',
  automation: 'flash-outline',
  info: 'notifications-outline',
};

/** Server-side notifications (automation results, briefings). */
export default function InboxScreen() {
  const router = useRouter();
  const online = useOnline();
  const q = useCachedQuery(['inbox'], () => endpoints.notifications.list());
  const [marking, setMarking] = useState(false);
  const items = q.data?.data ?? [];
  const unread = items.filter((i) => !i.readAt).length;

  const markRead = async (ids: string[] | 'all') => {
    try {
      await endpoints.notifications.markRead(ids);
      await queryClient.invalidateQueries({ queryKey: ['inbox'] });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const open = (item: InboxItem) => {
    if (!item.readAt && online) void markRead([item.id]);
    const route = typeof item.data?.route === 'string' ? item.data.route : null;
    if (route && route.startsWith('/')) router.push(route as never);
  };

  return (
    <Screen
      header={
        <ScreenHeader
          title="Inbox"
          subtitle={unread ? `${unread} unread` : undefined}
          right={
            unread > 0 ? (
              <Button
                title="Mark all read"
                size="sm"
                variant="ghost"
                loading={marking}
                disabled={!online}
                onPress={async () => {
                  setMarking(true);
                  await markRead('all');
                  setMarking(false);
                }}
              />
            ) : null
          }
        />
      }
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
    >
      <StaleBanner cachedAt={q.data?.cachedAt} />
      {q.isLoading ? (
        <LoadingState compact />
      ) : q.error && !items.length ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !items.length ? (
        <EmptyState icon="notifications-off-outline" title="No notifications" body="Results from your automations and briefings appear here." />
      ) : (
        <Card padded={false} style={{ paddingHorizontal: 12 }}>
          {items.map((item, i) => (
            <View key={item.id}>
              {i > 0 ? <Divider inset={48} /> : null}
              <ListItem
                icon={KIND_ICON[item.kind] ?? 'notifications-outline'}
                title={item.title}
                subtitle={`${item.body}\n${timeAgo(item.createdAt)}`}
                onPress={() => open(item)}
                right={!item.readAt ? <Icon name="ellipse" size={10} color="primary" accessibilityLabel="Unread" /> : null}
              />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
