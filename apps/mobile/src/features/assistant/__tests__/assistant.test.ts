import type { ChatMessage, ToolCallSummary } from '@aura/shared';
import { chatReducer, initialChatState, lastRetryable, type ChatUiState } from '../chatState';
import { markdownToPlain, parseInline, parseMarkdown } from '../markdown';
import { cleanPhone, mailtoUrl, smsUrl, whatsappUrls } from '../draftLinks';
import { decisionMessage, expiresIn } from '../actionText';

const NOW = '2026-10-15T10:00:00.000Z';
const CID = '11111111-1111-4111-8111-111111111111';

function msg(over: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    conversationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    role: 'assistant',
    text: '',
    toolCalls: [],
    sources: [],
    status: 'complete',
    createdAt: NOW,
    ...over,
  };
}

const call = (over: Partial<ToolCallSummary> = {}): ToolCallSummary => ({
  id: 'toolu_1',
  name: 'create_reminder',
  label: 'Set reminder',
  status: 'succeeded',
  summary: 'Reminder set',
  pendingActionId: null,
  display: null,
  ...over,
});

function sent(): ChatUiState {
  return chatReducer(initialChatState, { type: 'send', clientMessageId: CID, text: 'Remind me', inputMode: 'text', now: NOW });
}

describe('chat reducer', () => {
  it('shows the user message immediately and a streaming placeholder', () => {
    const s = sent();
    expect(s.streaming).toBe(true);
    expect(s.messages.map((m) => [m.role, m.status])).toEqual([
      ['user', 'sending'],
      ['assistant', 'streaming'],
    ]);
  });

  it('folds deltas, tools, sources and done into the final message', () => {
    let s = sent();
    s = chatReducer(s, { type: 'event', event: { type: 'user_message', message: msg({ id: 'u1', role: 'user', text: 'Remind me' }) } });
    expect(s.messages[0]).toMatchObject({ id: 'u1', status: 'complete', clientMessageId: CID });
    s = chatReducer(s, { type: 'event', event: { type: 'text_delta', text: 'Setting it' } });
    s = chatReducer(s, { type: 'event', event: { type: 'tool_start', id: 'toolu_1', name: 'create_reminder', label: 'Set reminder' } });
    expect(s.messages[1]!.pendingTools).toHaveLength(1);
    expect(s.messages[1]!.text).toBe('Setting it\n\n');
    s = chatReducer(s, { type: 'event', event: { type: 'tool_end', call: call() } });
    expect(s.messages[1]!.pendingTools).toHaveLength(0);
    expect(s.messages[1]!.toolCalls).toHaveLength(1);
    s = chatReducer(s, { type: 'event', event: { type: 'sources', sources: [{ title: 'x', url: 'https://x.dev' }] } });
    expect(s.messages[1]!.sources).toHaveLength(1);
    const final = msg({ id: 'a1', text: 'Done — reminder set.', toolCalls: [call()] });
    s = chatReducer(s, { type: 'event', event: { type: 'done', message: final } });
    expect(s.streaming).toBe(false);
    expect(s.messages[1]).toMatchObject({ id: 'a1', text: 'Done — reminder set.', status: 'complete' });
    s = chatReducer(s, { type: 'finished' });
    expect(s.messages).toHaveLength(2);
  });

  it('marks the turn failed (and retryable) when the stream breaks before done', () => {
    let s = sent();
    s = chatReducer(s, { type: 'finished', error: { code: 'offline', message: 'Offline' } });
    expect(s.streaming).toBe(false);
    expect(s.error?.code).toBe('offline');
    expect(s.messages).toHaveLength(1); // empty placeholder dropped
    expect(s.messages[0]!.status).toBe('error');
    expect(lastRetryable(s)?.clientMessageId).toBe(CID);

    // Retrying with the same id replaces the failed copy.
    const retried = chatReducer(s, { type: 'send', clientMessageId: CID, text: 'Remind me', inputMode: 'text', now: NOW });
    expect(retried.messages.filter((m) => m.role === 'user')).toHaveLength(1);
  });

  it('keeps partial work visible when cancelled', () => {
    let s = sent();
    s = chatReducer(s, { type: 'event', event: { type: 'tool_end', call: call() } });
    s = chatReducer(s, { type: 'finished', cancelled: true });
    const assistant = s.messages.find((m) => m.role === 'assistant')!;
    expect(assistant.status).toBe('cancelled');
    expect(assistant.toolCalls).toHaveLength(1);
    expect(s.error).toBeNull();
  });

  it('does not replace an in-progress turn with a history load', () => {
    const s = sent();
    expect(chatReducer(s, { type: 'load', messages: [] })).toBe(s);
  });

  it('updates a confirmation card after the user decides', () => {
    let s = chatReducer(initialChatState, { type: 'load', messages: [msg({ toolCalls: [call({ status: 'awaiting_confirmation', pendingActionId: 'p1' })] })] });
    s = chatReducer(s, { type: 'updateToolCall', pendingActionId: 'p1', patch: { status: 'succeeded', summary: 'Deleted task' } });
    expect(s.messages[0]!.toolCalls[0]).toMatchObject({ status: 'succeeded', summary: 'Deleted task' });
  });
});

describe('markdown-lite', () => {
  it('parses inline styles and links', () => {
    expect(parseInline('Hi **there**, see `code` and [docs](https://a.dev) or https://b.dev')).toEqual([
      { type: 'text', text: 'Hi ' },
      { type: 'bold', text: 'there' },
      { type: 'text', text: ', see ' },
      { type: 'code', text: 'code' },
      { type: 'text', text: ' and ' },
      { type: 'link', text: 'docs', url: 'https://a.dev' },
      { type: 'text', text: ' or ' },
      { type: 'link', text: 'https://b.dev', url: 'https://b.dev' },
    ]);
  });

  it('parses blocks: headings, bullets, numbers, code, paragraphs', () => {
    const blocks = parseMarkdown('## Today\n- Gym at 7\n* Call mom\n1. First\n\nLine one\nline two\n```\nx = 1\n```');
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'bullet', 'bullet', 'bullet', 'paragraph', 'code']);
    expect(blocks[3]).toMatchObject({ marker: '1.' });
    expect(blocks[4]).toMatchObject({ content: [{ type: 'text', text: 'Line one line two' }] });
    expect(blocks[5]).toEqual({ type: 'code', text: 'x = 1' });
  });

  it('converts to plain text for copying', () => {
    expect(markdownToPlain('**Done**\n- one')).toBe('Done\n• one');
  });
});

describe('draft links', () => {
  it('builds SMS, email and WhatsApp links with encoded bodies', () => {
    expect(cleanPhone('+91 98765-43210')).toBe('+919876543210');
    expect(smsUrl('Hi & bye', '+91 98765 43210')).toBe('sms:+919876543210?body=Hi%20%26%20bye');
    expect(smsUrl('Hi')).toBe('sms:?body=Hi');
    expect(mailtoUrl('Body', { to: 'a@b.co', subject: 'Hello there' })).toBe('mailto:a%40b.co?subject=Hello%20there&body=Body');
    expect(mailtoUrl('Body', { to: 'Mom' })).toBe('mailto:?body=Body');
    expect(whatsappUrls('Hi', '+91 98765 43210')).toEqual({
      app: 'whatsapp://send?phone=919876543210&text=Hi',
      web: 'https://wa.me/919876543210?text=Hi',
    });
  });
});

describe('pending action text', () => {
  const now = new Date('2026-10-15T10:00:00Z');

  it('formats future expiry instead of "just now"', () => {
    expect(expiresIn('2026-10-16T09:00:00Z', now)).toBe('in 23 h');
    expect(expiresIn('2026-10-15T10:20:00Z', now)).toBe('in 20 min');
    expect(expiresIn('2026-10-15T10:00:20Z', now)).toBe('in a moment');
    expect(expiresIn('2026-10-18T10:00:00Z', now)).toBe('in 3 d');
    expect(expiresIn('2026-10-15T09:00:00Z', now)).toBe('expired');
  });

  it('gives each outcome its own message', () => {
    expect(decisionMessage('confirmed', 'Deleted task “X”')).toEqual({ kind: 'success', text: 'Deleted task “X”' });
    expect(decisionMessage('failed', null).kind).toBe('error');
    expect(decisionMessage('expired', null).text).toContain('expired');
    expect(decisionMessage('rejected', null).text).toContain('Cancelled');
  });
});
