import { useState } from 'react';
import { endpoints } from '@/lib/api/endpoints';
import { ApiError, isNetworkError } from '@/lib/api/client';

export type AiState =
  | { status: 'idle' }
  | { status: 'loading'; title: string }
  | { status: 'done'; title: string; text: string }
  | { status: 'error'; title: string; message: string };

/** One-shot AI writing request with honest offline / not-configured handling. */
export function useAiSuggestion() {
  const [state, setState] = useState<AiState>({ status: 'idle' });

  const run = async (title: string, instructions: string) => {
    setState({ status: 'loading', title });
    try {
      const res = await endpoints.ai.write({ kind: 'general', instructions });
      setState({ status: 'done', title, text: res.text });
    } catch (e) {
      const message = isNetworkError(e)
        ? "You're offline. AI suggestions need an internet connection."
        : e instanceof ApiError && e.code === 'ai_unavailable'
          ? 'AI is not configured on the server, so suggestions are unavailable.'
          : e instanceof Error
            ? e.message
            : 'Something went wrong';
      setState({ status: 'error', title, message });
    }
  };

  return { state, run, reset: () => setState({ status: 'idle' }) };
}
