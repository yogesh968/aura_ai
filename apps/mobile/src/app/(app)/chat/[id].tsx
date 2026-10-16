import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, EmptyState, ErrorState, Icon, IconButton, LoadingState, OfflineBanner, ScreenHeader, StaleBanner, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { loadDraft, saveDraft } from '@/lib/db/database';
import { useOnline } from '@/lib/network';
import { useSettingsStore } from '@/lib/settings';
import { useVoiceInput, voiceLocale } from '@/lib/voice/recognition';
import { speak, stopSpeaking } from '@/lib/voice/speech';
import { toast } from '@/lib/toast';
import { Composer } from '@/features/assistant/components/Composer';
import { MessageBubble } from '@/features/assistant/components/MessageBubble';
import { useAiHealth, useChatSession, type Attachment } from '@/features/assistant/useChatSession';

export default function ChatScreen() {
  // ?prompt= sends once; ?draft= only pre-fills the input.
  const params = useLocalSearchParams<{ id: string; prompt?: string; draft?: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const online = useOnline();
  const prefs = useSettingsStore((s) => s.preferences);
  const health = useAiHealth();
  const aiAvailable = health.data?.ai.available ?? true;

  const initialId = params.id && params.id !== 'new' ? params.id : null;
  const draftKey = `chat:${initialId ?? 'new'}`;
  const [text, setText] = useState(params.draft ? String(params.draft) : '');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const listRef = useRef<FlatList>(null);

  const session = useChatSession({
    conversationId: initialId,
    onConversationCreated: (id) => router.setParams({ id }),
    onAssistantDone: (message, inputMode) => {
      if (inputMode === 'voice' && prefs.voice.enabled && prefs.voice.autoSpeakReplies && message.text) {
        setSpeaking(true);
        speak(message.text, {
          language: prefs.language,
          rate: prefs.voice.rate,
          pitch: prefs.voice.pitch,
          voice: prefs.voice.voiceId,
          onDone: () => setSpeaking(false),
          onError: () => setSpeaking(false),
        });
      }
    },
  });
  const { state } = session;

  // Restore any unsent draft.
  useEffect(() => {
    let cancelled = false;
    void loadDraft(draftKey).then((d) => {
      if (!cancelled && d) setText((t) => t || d);
    });
    return () => {
      cancelled = true;
    };
  }, [draftKey]);

  useEffect(() => {
    const t = setTimeout(() => void saveDraft(draftKey, text), 400);
    return () => clearTimeout(t);
  }, [text, draftKey]);

  useEffect(() => () => void stopSpeaking(), []);

  const canChat = online && aiAvailable;
  const disabledReason = !online
    ? "You're offline. Chat needs internet — your history is still here."
    : !aiAvailable
      ? 'AI is not configured on the server, so chat is unavailable.'
      : undefined;

  const submit = useCallback(
    async (value: string, inputMode: 'text' | 'voice' = 'text') => {
      if (!value.trim() || !canChat) return;
      const atts = attachments;
      setText('');
      setAttachments([]);
      void saveDraft(draftKey, '');
      const ok = await session.send(value, { inputMode, attachments: atts });
      if (!ok && atts.length) setAttachments(atts); // keep attachments for retry
    },
    [attachments, canChat, draftKey, session],
  );

  // ?prompt= : pre-fill and send once.
  const promptSent = useRef(false);
  useEffect(() => {
    if (promptSent.current || !params.prompt || !canChat || health.isLoading) return;
    promptSent.current = true;
    void submit(String(params.prompt));
  }, [params.prompt, canChat, health.isLoading, submit]);

  const voice = useVoiceInput({
    lang: voiceLocale(prefs.language),
    onFinal: (t) => void submit(t, 'voice'),
  });
  useEffect(() => {
    if (voice.state === 'error' && voice.error) toast.error(voice.error.message);
  }, [voice.state, voice.error]);

  const onMic = () => {
    if (voice.state === 'listening') {
      voice.stop();
      return;
    }
    void stopSpeaking();
    setSpeaking(false);
    void voice.start();
  };

  const messages = useMemo(() => state.messages, [state.messages]);
  useEffect(() => {
    if (messages.length) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, [messages]);

  const loadingHistory = Boolean(session.conversationId) && session.history.isLoading && messages.length === 0;
  const title = initialId ? 'Chat' : 'New chat';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title={title}
        subtitle={prefs.assistantName}
        right={
          speaking ? (
            <IconButton
              icon="volume-mute-outline"
              label="Stop speaking"
              onPress={() => {
                void stopSpeaking();
                setSpeaking(false);
              }}
            />
          ) : null
        }
      />
      <OfflineBanner />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {loadingHistory ? (
          <LoadingState label="Loading conversation…" />
        ) : session.history.error && messages.length === 0 ? (
          <ErrorState error={session.history.error} onRetry={() => void session.history.refetch()} />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.key}
            contentContainerStyle={{ padding: 16, paddingBottom: 24, flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={<StaleBanner cachedAt={session.history.data?.cachedAt} />}
            ListEmptyComponent={
              <EmptyState
                icon="sparkles-outline"
                title={`Ask ${prefs.assistantName} anything`}
                body="Plan your day, set reminders, track spending, draft messages, or research a topic. Actions that change or delete things always ask you first."
              />
            }
            renderItem={({ item }) => (
              <MessageBubble message={item} onToolUpdate={(pendingActionId, patch) => session.dispatch({ type: 'updateToolCall', pendingActionId, patch })} />
            )}
            ListFooterComponent={
              state.error || session.canRetry ? (
                <Card tone="danger" style={{ gap: 8, marginTop: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <Icon name="alert-circle-outline" size={18} color="danger" />
                    <Text variant="caption" style={{ flex: 1 }}>
                      {state.error?.message ?? 'Your last message was not answered.'}
                    </Text>
                  </View>
                  {session.canRetry ? <Button title="Retry" size="sm" icon="refresh" variant="secondary" disabled={!canChat} onPress={session.retry} /> : null}
                </Card>
              ) : null
            }
          />
        )}
        <View style={{ paddingBottom: insets.bottom }}>
          <Composer
            value={voice.state === 'listening' ? voice.transcript : text}
            onChange={setText}
            onSend={() => void submit(text)}
            onStop={session.stop}
            streaming={state.streaming}
            disabled={!canChat}
            disabledReason={disabledReason}
            attachments={attachments}
            onAttachmentsChange={setAttachments}
            onMic={voice.availability === 'available' ? onMic : () => toast.info(voice.availability === 'needs-dev-build' ? 'Voice input needs the AURA development build (not available in Expo Go).' : 'No speech recognition service on this phone.')}
            listening={voice.state === 'listening'}
            placeholder={`Message ${prefs.assistantName}`}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
