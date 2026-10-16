import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';
import type { ToolCallSummary } from '@aura/shared';
import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { formatTime } from '@/lib/format';
import { toast } from '@/lib/toast';
import { haptics } from '@/lib/haptics';
import type { UiMessage } from '../chatState';
import { markdownToPlain } from '../markdown';
import { Markdown } from './Markdown';
import { PendingToolChip, SourcesList, ToolCallView } from './ToolCards';

function copy(text: string) {
  haptics.light();
  void Clipboard.setStringAsync(text).then(() => toast.success('Copied'));
}

/** A server note (e.g. "User confirmed: Deleted task …") shown as a centered chip. */
function EventChip({ message }: { message: UiMessage }) {
  const { colors, radius } = useTheme();
  const call = message.toolCalls[0];
  const ok = !call || call.status === 'succeeded';
  return (
    <View style={[styles.event, { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill }]} accessibilityRole="text">
      <Icon name={ok ? 'checkmark-done' : 'information-circle-outline'} size={14} color={ok ? 'success' : 'textMuted'} />
      <Text variant="small" color="textMuted" numberOfLines={2} style={{ flexShrink: 1 }}>
        {message.text}
      </Text>
    </View>
  );
}

export const MessageBubble = memo(function MessageBubble({
  message,
  onToolUpdate,
}: {
  message: UiMessage;
  onToolUpdate?: (pendingActionId: string, patch: Partial<ToolCallSummary>) => void;
}) {
  const { colors, radius } = useTheme();
  if (message.role === 'event') return <EventChip message={message} />;

  if (message.role === 'user') {
    const failed = message.status === 'error' || message.status === 'cancelled';
    return (
      <Animated.View entering={FadeInUp.duration(180)} style={styles.userRow}>
        <Pressable
          onLongPress={() => copy(message.text)}
          accessibilityHint="Long press to copy"
          style={[styles.bubble, { backgroundColor: colors.primary, borderRadius: radius.lg, borderBottomRightRadius: 6, opacity: message.status === 'sending' ? 0.8 : 1 }]}
        >
          <Text variant="body" color="primaryText" selectable>
            {message.text}
          </Text>
        </Pressable>
        <View style={styles.meta}>
          {message.inputMode === 'voice' ? <Icon name="mic-outline" size={12} color="textSubtle" /> : null}
          <Text variant="small" color={failed ? 'danger' : 'textSubtle'}>
            {message.status === 'sending' ? 'Sending…' : failed ? (message.status === 'cancelled' ? 'Stopped' : 'Not delivered') : formatTime(message.createdAt)}
          </Text>
        </View>
      </Animated.View>
    );
  }

  const streaming = message.status === 'streaming';
  const empty = !message.text.trim() && message.toolCalls.length === 0 && message.pendingTools.length === 0;
  return (
    <Animated.View entering={FadeInUp.duration(180)} style={styles.assistantRow}>
      <Pressable
        onLongPress={() => message.text && copy(markdownToPlain(message.text))}
        accessibilityHint="Long press to copy"
        style={[styles.bubble, styles.assistantBubble, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, borderBottomLeftRadius: 6 }]}
      >
        {streaming && empty ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityLabel="Thinking">
            <ActivityIndicator size="small" color={colors.primary} />
            <Text variant="caption" color="textMuted">
              Thinking…
            </Text>
          </View>
        ) : null}
        {message.text.trim() ? <Markdown text={message.text} /> : null}
        {message.toolCalls.length || message.pendingTools.length ? (
          <View style={{ gap: 8, marginTop: message.text.trim() ? 10 : 0 }}>
            {message.toolCalls.map((c) => (
              <ToolCallView key={c.id} call={c} onUpdate={c.pendingActionId ? (patch) => onToolUpdate?.(c.pendingActionId!, patch) : undefined} />
            ))}
            {message.pendingTools.map((t) => (
              <PendingToolChip key={t.id} tool={t} />
            ))}
          </View>
        ) : null}
        {message.sources.length ? (
          <View style={{ marginTop: 10 }}>
            <SourcesList sources={message.sources} />
          </View>
        ) : null}
      </Pressable>
      {message.status === 'error' || message.status === 'cancelled' ? (
        <Text variant="small" color={message.status === 'error' ? 'danger' : 'textSubtle'} style={{ marginLeft: 6 }}>
          {message.status === 'error' ? 'This reply had a problem' : 'Stopped'}
        </Text>
      ) : !streaming ? (
        <Text variant="small" color="textSubtle" style={{ marginLeft: 6 }}>
          {formatTime(message.createdAt)}
        </Text>
      ) : null}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  userRow: { alignItems: 'flex-end', gap: 4, marginVertical: 6 },
  assistantRow: { alignItems: 'flex-start', gap: 4, marginVertical: 6 },
  bubble: { maxWidth: '88%', paddingHorizontal: 14, paddingVertical: 10 },
  assistantBubble: { borderWidth: StyleSheet.hairlineWidth, maxWidth: '96%' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 6 },
  event: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6, marginVertical: 6, maxWidth: '90%' },
});
