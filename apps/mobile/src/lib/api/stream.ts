import { fetch as expoFetch } from 'expo/fetch';
import type { ChatStreamEvent, SendMessageInput } from '@aura/shared';
import { ApiError, buildUrl, getFreshAccessToken, NetworkError } from './client';

/**
 * Send a chat message and consume the Server-Sent Events stream.
 * Uses expo/fetch, whose response body is a readable stream on Android.
 * Aborting the signal closes the connection, which cancels the turn server-side.
 */
export async function streamChat(
  conversationId: string,
  input: SendMessageInput,
  onEvent: (e: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const open = async (token: string | null) => {
    try {
      return await expoFetch(buildUrl(`/v1/conversations/${conversationId}/messages`), {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(input),
        signal,
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new NetworkError();
    }
  };

  let res = await open(await getFreshAccessToken());
  if (res.status === 401) res = await open(await getFreshAccessToken(true));
  if (!res.ok || !res.body) {
    let body: { error?: { code?: string; message?: string } } = {};
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, body.error?.code ?? 'http_error', body.error?.message ?? `Request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const chunk = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = chunk
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trimStart())
          .join('\n');
        if (!data) continue; // comments / keep-alives
        try {
          onEvent(JSON.parse(data) as ChatStreamEvent);
        } catch {
          /* ignore malformed event */
        }
      }
    }
  } catch {
    if (signal?.aborted) return;
    throw new NetworkError('The connection dropped while the assistant was replying.');
  }
}
