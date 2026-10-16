import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Button, Card, IconButton, Text, TextField } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { useOnline } from '@/lib/network';
import { useSettingsStore } from '@/lib/settings';
import { useVoiceInput, voiceLocale } from '@/lib/voice/recognition';
import { speak, stopSpeaking } from '@/lib/voice/speech';
import { haptics } from '@/lib/haptics';
import { Markdown } from '@/features/assistant/components/Markdown';
import { Orb, type OrbState } from '@/features/assistant/components/Orb';
import { PendingToolChip, ToolCallView } from '@/features/assistant/components/ToolCards';
import { useAiHealth, useChatSession } from '@/features/assistant/useChatSession';

/**
 * Full-screen voice assistant: listen → think (streaming agent turn) → speak.
 * Uses one "Voice" conversation per session. No wake word (not implemented).
 */
export default function VoiceScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const online = useOnline();
  const prefs = useSettingsStore((s) => s.preferences);
  const health = useAiHealth();
  const aiAvailable = health.data?.ai.available ?? true;
  const [speaking, setSpeaking] = useState(false);
  const [lastUtterance, setLastUtterance] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
      void stopSpeaking();
    },
    [],
  );

  const session = useChatSession({
    conversationId: null,
    newTitle: 'Voice',
    onAssistantDone: (message) => {
      if (!mounted.current || !message.text || !prefs.voice.enabled) return;
      setSpeaking(true);
      speak(message.text, {
        language: prefs.language,
        rate: prefs.voice.rate,
        pitch: prefs.voice.pitch,
        voice: prefs.voice.voiceId,
        onDone: () => mounted.current && setSpeaking(false),
        onError: () => mounted.current && setSpeaking(false),
      });
    },
  });

  const ask = useCallback(
    (text: string, mode: 'voice' | 'text' = 'voice') => {
      if (!text.trim()) return;
      setLastUtterance(text);
      void session.send(text, { inputMode: mode });
    },
    [session],
  );

  const voice = useVoiceInput({ lang: voiceLocale(prefs.language), onFinal: (t) => ask(t) });
  const available = voice.availability === 'available';
  const canAsk = online && aiAvailable;

  const lastAssistant = [...session.state.messages].reverse().find((m) => m.role === 'assistant');
  const orbState: OrbState =
    voice.state === 'listening'
      ? 'listening'
      : session.state.streaming
        ? 'thinking'
        : speaking
          ? 'speaking'
          : voice.state === 'error' || session.state.error
            ? 'error'
            : 'idle';

  const statusText =
    orbState === 'listening'
      ? voice.transcript || 'Listening…'
      : orbState === 'thinking'
        ? 'Thinking…'
        : orbState === 'speaking'
          ? 'Speaking…'
          : orbState === 'error'
            ? (voice.error?.message ?? session.state.error?.message ?? 'Something went wrong')
            : !canAsk
              ? online
                ? 'AI is not configured on the server.'
                : "You're offline. Voice chat needs internet."
              : available
                ? 'Tap the mic and speak'
                : 'Type your request below';

  const stopAll = () => {
    haptics.medium();
    if (voice.state === 'listening') voice.abort();
    if (session.state.streaming) session.stop();
    void stopSpeaking();
    setSpeaking(false);
  };

  const onMic = () => {
    if (!canAsk) return;
    if (voice.state === 'listening') {
      voice.stop();
      return;
    }
    void stopSpeaking();
    setSpeaking(false);
    voice.reset();
    session.dispatch({ type: 'dismissError' });
    haptics.light();
    void voice.start();
  };

  const busy = orbState === 'listening' || orbState === 'thinking' || orbState === 'speaking';

  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.top}>
        <Text variant="subheading" color="textMuted">
          {prefs.assistantName} · Voice
        </Text>
        <IconButton
          icon="close"
          label="Close voice mode"
          onPress={() => {
            stopAll();
            router.back();
          }}
        />
      </View>

      <ScrollView contentContainerStyle={styles.center} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" accessibilityLabel={voice.state === 'listening' ? 'Stop listening' : 'Start listening'} disabled={!available || !canAsk} onPress={onMic}>
          <Orb state={orbState} />
        </Pressable>
        <Text variant="heading" align="center" style={{ marginTop: 8, paddingHorizontal: 24 }} accessibilityLiveRegion="polite">
          {statusText}
        </Text>
        {lastUtterance && orbState !== 'listening' ? (
          <Text variant="caption" color="textMuted" align="center" style={{ marginTop: 8, paddingHorizontal: 32 }}>
            “{lastUtterance}”
          </Text>
        ) : null}

        {lastAssistant && (lastAssistant.text || lastAssistant.toolCalls.length || lastAssistant.pendingTools.length) ? (
          <Animated.View entering={FadeIn.duration(200)} style={{ alignSelf: 'stretch', marginTop: 20, gap: 8 }}>
            <Card style={{ gap: 8 }}>
              {lastAssistant.text ? <Markdown text={lastAssistant.text} /> : null}
              {lastAssistant.toolCalls.map((c) => (
                <ToolCallView key={c.id} call={c} onUpdate={c.pendingActionId ? (patch) => session.dispatch({ type: 'updateToolCall', pendingActionId: c.pendingActionId!, patch }) : undefined} />
              ))}
              {lastAssistant.pendingTools.map((t) => (
                <PendingToolChip key={t.id} tool={t} />
              ))}
            </Card>
          </Animated.View>
        ) : null}

        {!available ? (
          <Card tone="alt" style={{ alignSelf: 'stretch', marginTop: 20, gap: 10 }}>
            <Text variant="caption" color="textMuted">
              {voice.availability === 'needs-dev-build'
                ? 'Speech recognition needs the AURA development build — it is not available in Expo Go. You can type instead; replies are still read aloud.'
                : 'This phone has no speech recognition service (install or enable Google speech services). You can type instead.'}
            </Text>
            <TextField value={typed} onChangeText={setTyped} placeholder="Type your request" editable={canAsk} returnKeyType="send" onSubmitEditing={() => { ask(typed, 'text'); setTyped(''); }} />
            <Button title="Ask" size="sm" disabled={!canAsk || !typed.trim() || session.state.streaming} onPress={() => { ask(typed, 'text'); setTyped(''); }} />
          </Card>
        ) : null}
      </ScrollView>

      <View style={styles.controls}>
        <Button title="Stop" icon="stop" variant="secondary" disabled={!busy} onPress={stopAll} style={{ flex: 1 }} />
        {available ? (
          <Button
            title={voice.state === 'listening' ? 'Done' : 'Speak'}
            icon="mic"
            disabled={!canAsk || session.state.streaming}
            onPress={onMic}
            style={{ flex: 1 }}
          />
        ) : null}
        <Button
          title="Retry"
          icon="refresh"
          variant="secondary"
          // Only a failed turn can be retried (same clientMessageId); re-asking a request that
          // already succeeded could repeat its action, e.g. record an expense twice.
          disabled={!session.canRetry || busy || !canAsk}
          onPress={() => session.retry()}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 8 },
  center: { alignItems: 'center', paddingHorizontal: 20, paddingVertical: 24, flexGrow: 1, justifyContent: 'center' },
  controls: { flexDirection: 'row', gap: 10, paddingHorizontal: 20 },
});
