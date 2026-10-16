import type { ChatMessage, ChatStreamEvent, Source, ToolCallSummary } from '@aura/shared';

/**
 * Pure state machine for a chat screen. Server-sent events are folded into
 * a list of UI messages; nothing is shown as done until the server says so.
 */

export interface PendingTool {
  id: string;
  name: string;
  label: string;
}

export interface UiMessage {
  /** Stable React key. */
  key: string;
  /** Server id once known. */
  id: string | null;
  role: ChatMessage['role'];
  text: string;
  toolCalls: ToolCallSummary[];
  sources: Source[];
  status: ChatMessage['status'] | 'sending' | 'streaming';
  createdAt: string;
  pendingTools: PendingTool[];
  /** For user messages sent from this device: used to retry idempotently. */
  clientMessageId?: string;
  inputMode?: 'text' | 'voice';
}

export interface ChatUiState {
  messages: UiMessage[];
  streaming: boolean;
  error: { code: string; message: string } | null;
}

export type ChatAction =
  | { type: 'load'; messages: ChatMessage[] }
  | { type: 'send'; clientMessageId: string; text: string; inputMode: 'text' | 'voice'; now?: string }
  | { type: 'event'; event: ChatStreamEvent }
  | { type: 'finished'; error?: { code: string; message: string } | null; cancelled?: boolean }
  | { type: 'updateToolCall'; pendingActionId: string; patch: Partial<ToolCallSummary> }
  | { type: 'dismissError' };

export const initialChatState: ChatUiState = { messages: [], streaming: false, error: null };

const STREAM_KEY = 'streaming-reply';

export function fromServer(m: ChatMessage): UiMessage {
  return {
    key: m.id,
    id: m.id,
    role: m.role,
    text: m.text,
    toolCalls: m.toolCalls,
    sources: m.sources,
    status: m.status,
    createdAt: m.createdAt,
    pendingTools: [],
  };
}

function updateStreaming(state: ChatUiState, fn: (m: UiMessage) => UiMessage): ChatUiState {
  return { ...state, messages: state.messages.map((m) => (m.key === STREAM_KEY ? fn(m) : m)) };
}

export function chatReducer(state: ChatUiState, action: ChatAction): ChatUiState {
  switch (action.type) {
    case 'load': {
      // Never clobber an in-progress turn with a (possibly older) history fetch.
      if (state.streaming) return state;
      const failedLocal = state.messages.filter((m) => m.role === 'user' && m.status === 'error' && !m.id);
      return { ...state, messages: [...action.messages.map(fromServer), ...failedLocal] };
    }
    case 'send': {
      const now = action.now ?? new Date().toISOString();
      // A retry replaces the failed copy of the same message.
      const kept = state.messages.filter((m) => m.clientMessageId !== action.clientMessageId && m.key !== STREAM_KEY);
      return {
        streaming: true,
        error: null,
        messages: [
          ...kept,
          {
            key: `local:${action.clientMessageId}`,
            id: null,
            role: 'user',
            text: action.text,
            toolCalls: [],
            sources: [],
            status: 'sending',
            createdAt: now,
            pendingTools: [],
            clientMessageId: action.clientMessageId,
            inputMode: action.inputMode,
          },
          { key: STREAM_KEY, id: null, role: 'assistant', text: '', toolCalls: [], sources: [], status: 'streaming', createdAt: now, pendingTools: [] },
        ],
      };
    }
    case 'event': {
      const e = action.event;
      switch (e.type) {
        case 'user_message': {
          const idx = state.messages.findIndex((m) => m.role === 'user' && m.status === 'sending');
          if (idx < 0) return state;
          const messages = [...state.messages];
          const local = messages[idx]!;
          messages[idx] = { ...fromServer(e.message), key: local.key, clientMessageId: local.clientMessageId, inputMode: local.inputMode };
          return { ...state, messages };
        }
        case 'text_delta':
          return updateStreaming(state, (m) => ({ ...m, text: m.text + e.text }));
        case 'tool_start':
          return updateStreaming(state, (m) => ({
            ...m,
            // Separate pre-tool narration from what follows.
            text: m.text && !m.text.endsWith('\n') ? `${m.text}\n\n` : m.text,
            pendingTools: [...m.pendingTools, { id: e.id, name: e.name, label: e.label }],
          }));
        case 'tool_end':
          return updateStreaming(state, (m) => ({
            ...m,
            pendingTools: m.pendingTools.filter((t) => t.id !== e.call.id),
            toolCalls: [...m.toolCalls, e.call],
          }));
        case 'sources':
          return updateStreaming(state, (m) => ({ ...m, sources: e.sources }));
        case 'error':
          return { ...state, error: { code: e.code, message: e.message } };
        case 'done': {
          const finalMsg = fromServer(e.message);
          const hasStream = state.messages.some((m) => m.key === STREAM_KEY);
          const messages = hasStream
            ? state.messages.map((m) => (m.key === STREAM_KEY ? finalMsg : m))
            : [...state.messages.filter((m) => m.id !== finalMsg.id), finalMsg];
          // The user message was accepted even if the reply errored.
          return {
            ...state,
            streaming: false,
            messages: messages.map((m) => (m.role === 'user' && m.status === 'sending' ? { ...m, status: 'complete' } : m)),
          };
        }
        default:
          return state;
      }
    }
    case 'finished': {
      if (!state.streaming) return action.error ? { ...state, error: action.error } : state;
      const messages: UiMessage[] = [];
      for (const m of state.messages) {
        if (m.key === STREAM_KEY) {
          // Keep partial work visible (tools that really ran), but mark it.
          if (m.text.trim() || m.toolCalls.length) {
            messages.push({ ...m, key: `partial:${Date.now()}`, status: action.cancelled ? 'cancelled' : 'error', pendingTools: [] });
          }
          continue;
        }
        if (m.role === 'user' && m.status === 'sending') {
          messages.push({ ...m, status: action.cancelled ? 'cancelled' : 'error' });
          continue;
        }
        messages.push(m);
      }
      return { streaming: false, messages, error: action.error ?? (action.cancelled ? null : state.error) };
    }
    case 'updateToolCall':
      return {
        ...state,
        messages: state.messages.map((m) => ({
          ...m,
          toolCalls: m.toolCalls.map((c) => (c.pendingActionId === action.pendingActionId ? { ...c, ...action.patch } : c)),
        })),
      };
    case 'dismissError':
      return { ...state, error: null };
  }
}

/** The most recent user message that failed and can be retried. */
export function lastRetryable(state: ChatUiState): UiMessage | null {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const m = state.messages[i]!;
    if (m.role === 'user') return (m.status === 'error' || m.status === 'cancelled') && m.clientMessageId ? m : null;
  }
  return null;
}
