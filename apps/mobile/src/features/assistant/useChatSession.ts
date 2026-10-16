import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { useQuery } from '@tanstack/react-query';
import type { ChatMessage } from '@aura/shared';
import { endpoints } from '@/lib/api/endpoints';
import { ApiError, errorMessage, isNetworkError } from '@/lib/api/client';
import { streamChat } from '@/lib/api/stream';
import { queryClient, useCachedQuery } from '@/lib/data';
import { chatReducer, initialChatState, lastRetryable } from './chatState';

export interface Attachment {
  kind: 'image' | 'document';
  documentId: string;
  name: string;
}

export interface SendOptions {
  inputMode?: 'text' | 'voice';
  attachments?: Attachment[];
  /** Reuse an id to retry idempotently. */
  clientMessageId?: string;
}

/** Shared AI availability check (cached for a minute). */
export function useAiHealth() {
  return useQuery({ queryKey: ['health'], queryFn: endpoints.health, staleTime: 60_000, retry: 1 });
}

/**
 * Chat state for one conversation: history (cached for offline viewing),
 * streaming sends, stop, and idempotent retry. When `conversationId` is null
 * a conversation is created on the first send.
 */
export function useChatSession(opts: {
  conversationId: string | null;
  newTitle?: string;
  onConversationCreated?: (id: string) => void;
  onAssistantDone?: (message: ChatMessage, inputMode: 'text' | 'voice') => void;
}) {
  const [conversationId, setConversationId] = useState<string | null>(opts.conversationId);
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const abortRef = useRef<AbortController | null>(null);
  const cbRef = useRef(opts);
  useEffect(() => {
    cbRef.current = opts;
  });

  const history = useCachedQuery(
    ['chat-messages', conversationId],
    () => endpoints.conversations.messages(conversationId!),
    { enabled: Boolean(conversationId) },
  );

  useEffect(() => {
    if (history.data) dispatch({ type: 'load', messages: history.data.data });
  }, [history.data]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (text: string, sendOpts: SendOptions = {}) => {
      const trimmed = text.trim();
      if (!trimmed || state.streaming) return false;
      const inputMode = sendOpts.inputMode ?? 'text';
      const clientMessageId = sendOpts.clientMessageId ?? Crypto.randomUUID();
      dispatch({ type: 'send', clientMessageId, text: trimmed, inputMode });

      let id = conversationId;
      try {
        if (!id) {
          const created = await endpoints.conversations.create(cbRef.current.newTitle);
          id = created.id;
          setConversationId(id);
          cbRef.current.onConversationCreated?.(id);
        }
      } catch (e) {
        dispatch({ type: 'finished', error: { code: isNetworkError(e) ? 'offline' : 'create_failed', message: errorMessage(e) } });
        return false;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      let done: ChatMessage | null = null;
      try {
        await streamChat(
          id,
          {
            text: trimmed,
            clientMessageId,
            inputMode,
            clientNow: new Date().toISOString(),
            ...(sendOpts.attachments?.length ? { attachments: sendOpts.attachments.map((a) => ({ kind: a.kind, documentId: a.documentId })) } : {}),
          },
          (event) => {
            dispatch({ type: 'event', event });
            if (event.type === 'done') done = event.message;
          },
          controller.signal,
        );
        if (controller.signal.aborted) dispatch({ type: 'finished', cancelled: true });
        else dispatch({ type: 'finished' });
      } catch (e) {
        if (controller.signal.aborted) dispatch({ type: 'finished', cancelled: true });
        else {
          const code = e instanceof ApiError ? e.code : isNetworkError(e) ? 'offline' : 'error';
          dispatch({ type: 'finished', error: { code, message: errorMessage(e) } });
        }
      } finally {
        abortRef.current = null;
        void queryClient.invalidateQueries({ queryKey: ['conversations'] });
        void queryClient.invalidateQueries({ queryKey: ['actions'] });
      }
      if (done) {
        void queryClient.invalidateQueries({ queryKey: ['chat-messages', id] });
        cbRef.current.onAssistantDone?.(done, inputMode);
      }
      return Boolean(done);
    },
    [conversationId, state.streaming],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const retryable = lastRetryable(state);
  const retry = useCallback(() => {
    if (!retryable) return;
    void send(retryable.text, { clientMessageId: retryable.clientMessageId, inputMode: retryable.inputMode });
  }, [retryable, send]);

  return {
    conversationId,
    state,
    dispatch,
    history,
    send,
    stop,
    retry,
    canRetry: Boolean(retryable) && !state.streaming,
  };
}
