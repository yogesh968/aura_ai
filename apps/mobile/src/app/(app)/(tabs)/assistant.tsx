import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Conversation } from '@aura/shared';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  GradientCard,
  Icon,
  IconButton,
  ListItem,
  LoadingState,
  Screen,
  SectionHeader,
  Sheet,
  StaleBanner,
  Text,
  TextField,
} from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { endpoints } from '@/lib/api/endpoints';
import { errorMessage, isNetworkError } from '@/lib/api/client';
import { queryClient, useCachedQuery } from '@/lib/data';
import { timeAgo } from '@/lib/format';
import { useOnline } from '@/lib/network';
import { useSettingsStore } from '@/lib/settings';
import { toast } from '@/lib/toast';
import { useAiHealth } from '@/features/assistant/useChatSession';

const SUGGESTIONS = [
  { label: 'Plan my day', prompt: 'Plan my day', icon: 'today-outline' },
  { label: 'Summarize my week', prompt: 'Summarize my week: what did I finish and what is still open?', icon: 'stats-chart-outline' },
  { label: 'Remind me tomorrow at 9 AM to…', prompt: 'Remind me tomorrow at 9 AM to ', icon: 'alarm-outline', fill: true },
  { label: "What's the weather?", prompt: "What's the weather today?", icon: 'partly-sunny-outline' },
  { label: 'Add expense 250 for lunch', prompt: 'Add an expense of 250 for lunch', icon: 'wallet-outline' },
  { label: 'Kal subah 7 baje gym yaad dilana', prompt: 'Kal subah 7 baje gym yaad dilana', icon: 'language-outline' },
] as const;

export default function AssistantTab() {
  const router = useRouter();
  const { colors, radius } = useTheme();
  const online = useOnline();
  const assistantName = useSettingsStore((s) => s.preferences.assistantName);
  const health = useAiHealth();
  const aiUnavailable = health.data ? !health.data.ai.available : false;
  const canChat = online && !aiUnavailable;

  const conversations = useCachedQuery(['conversations'], () => endpoints.conversations.list());
  const pending = useQuery({ queryKey: ['actions', 'pending'], queryFn: () => endpoints.actions.list('pending'), enabled: online });
  const [renaming, setRenaming] = useState<Conversation | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const openChat = (prompt?: string, fill?: boolean) => {
    if (!canChat) return;
    if (fill && prompt) router.push({ pathname: '/chat/[id]', params: { id: 'new', draft: prompt } });
    else router.push({ pathname: '/chat/[id]', params: prompt ? { id: 'new', prompt } : { id: 'new' } });
  };

  const rename = async () => {
    if (!renaming || !newTitle.trim()) return;
    setSaving(true);
    try {
      await endpoints.conversations.rename(renaming.id, newTitle.trim());
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setRenaming(null);
      toast.success('Renamed');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = (c: Conversation) => {
    Alert.alert('Delete conversation?', `“${c.title}” and its messages will be permanently deleted. Tasks or notes it created are kept.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await endpoints.conversations.remove(c.id);
            await queryClient.invalidateQueries({ queryKey: ['conversations'] });
            toast.success('Conversation deleted');
          } catch (e) {
            toast.error(errorMessage(e));
          }
        },
      },
    ]);
  };

  const pendingCount = pending.data?.length ?? 0;
  const list = conversations.data?.data ?? [];

  return (
    <Screen
      tabBarInset
      refreshing={conversations.isRefetching}
      onRefresh={() => {
        void conversations.refetch();
        void pending.refetch();
        void health.refetch();
      }}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text variant="overline" color="textMuted">
            Assistant
          </Text>
          <Text variant="title" accessibilityRole="header">
            {assistantName}
          </Text>
        </View>
        <IconButton icon="notifications-outline" label="Notifications inbox" onPress={() => router.push('/inbox')} />
      </View>

      {aiUnavailable ? (
        <Card tone="warning" style={{ gap: 6, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="sparkles-outline" size={18} color="warning" />
            <Text variant="subheading">AI isn’t set up on the server</Text>
          </View>
          <Text variant="caption" color="textMuted">
            Chat and voice need an AI provider key on the backend (see the README). Everything else — tasks, reminders, notes, habits, money — works normally.
          </Text>
        </Card>
      ) : null}

      <GradientCard>
        <Text variant="heading" style={{ color: '#FFFFFF' }}>
          How can I help today?
        </Text>
        <Text variant="caption" style={{ color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>
          English, हिन्दी or Hinglish — type or talk.
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <Button title="New chat" icon="chatbubble-ellipses-outline" variant="secondary" disabled={!canChat} onPress={() => openChat()} style={{ flex: 1 }} />
          <Button title="Voice" icon="mic-outline" variant="secondary" disabled={!canChat} onPress={() => router.push('/voice')} style={{ flex: 1 }} />
        </View>
        {!online ? (
          <Text variant="small" style={{ color: 'rgba(255,255,255,0.9)', marginTop: 10 }}>
            You’re offline — chat will be available when you reconnect.
          </Text>
        ) : null}
      </GradientCard>

      {pendingCount > 0 ? (
        <Card tone="warning" onPress={() => router.push('/actions')} accessibilityLabel={`${pendingCount} actions waiting for your confirmation`} style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="shield-checkmark-outline" size={20} color="warning" />
          <Text variant="body" style={{ flex: 1 }}>
            {pendingCount} action{pendingCount === 1 ? '' : 's'} waiting for your OK
          </Text>
          <Icon name="chevron-forward" size={16} color="textMuted" />
        </Card>
      ) : null}

      <SectionHeader title="Try asking" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {SUGGESTIONS.map((s, i) => (
          <Animated.View key={s.label} entering={FadeInDown.duration(220).delay(i * 40)}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={s.label}
              disabled={!canChat}
              onPress={() => openChat(s.prompt, 'fill' in s)}
              style={({ pressed }) => [
                styles.suggestion,
                { borderRadius: radius.lg, borderColor: colors.border, backgroundColor: pressed ? colors.surfacePressed : colors.surface, opacity: canChat ? 1 : 0.5 },
              ]}
            >
              <Icon name={s.icon} size={18} color="primary" />
              <Text variant="caption" numberOfLines={2} style={{ maxWidth: 150 }}>
                {s.label}
              </Text>
            </Pressable>
          </Animated.View>
        ))}
      </ScrollView>

      <SectionHeader title="Conversations" />
      <StaleBanner cachedAt={conversations.data?.cachedAt} />
      {conversations.isLoading ? (
        <LoadingState compact label="Loading conversations…" />
      ) : conversations.error && !list.length ? (
        isNetworkError(conversations.error) ? (
          <EmptyState compact icon="cloud-offline-outline" title="Conversations aren’t available offline yet" body="Open the app once while online and they’ll be saved for offline viewing." />
        ) : (
          <ErrorState compact error={conversations.error} onRetry={() => void conversations.refetch()} />
        )
      ) : list.length === 0 ? (
        <EmptyState compact icon="chatbubbles-outline" title="No conversations yet" body="Start a chat or try one of the suggestions above." actionLabel={canChat ? 'New chat' : undefined} onAction={() => openChat()} />
      ) : (
        <Card padded={false} style={{ paddingHorizontal: 12 }}>
          {list.map((c, i) => (
            <View key={c.id}>
              {i > 0 ? <Divider inset={48} /> : null}
              <ListItem
                icon="chatbubble-outline"
                title={c.title}
                subtitle={`${c.lastMessagePreview ? `${c.lastMessagePreview} · ` : ''}${timeAgo(c.updatedAt)}`}
                onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.id } })}
                onLongPress={() => {
                  setNewTitle(c.title);
                  setRenaming(c);
                }}
                accessibilityHint="Long press to rename"
                right={<IconButton icon="trash-outline" label={`Delete ${c.title}`} size={18} disabled={!online} onPress={() => remove(c)} />}
              />
            </View>
          ))}
        </Card>
      )}

      <Sheet
        visible={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename conversation"
        footer={<Button title="Save" loading={saving} disabled={!newTitle.trim() || !online} onPress={() => void rename()} fullWidth />}
      >
        <TextField label="Title" value={newTitle} onChangeText={setNewTitle} maxLength={80} autoFocus />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, marginTop: 8 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1 },
});
