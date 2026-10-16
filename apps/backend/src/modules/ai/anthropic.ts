import Anthropic from '@anthropic-ai/sdk';
import type { Config } from '../../config';
import {
  AiRefusalError,
  AiUnavailableError,
  textOf,
  type AiProvider,
  type CompleteRequest,
  type CompleteResponse,
  type ToolUnion,
  type TurnRequest,
  type TurnResponse,
} from './provider';

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/**
 * Claude via the official Anthropic SDK. All calls stream (long turns don't
 * hit HTTP timeouts) and use adaptive thinking (always on for Claude Opus 5.5)
 * with a configurable effort. When enabled, server-side refusal fallbacks
 * route a declined request to a fallback model inside the same call.
 */
export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  readonly available = true;
  readonly supportsWebSearch = true;
  readonly model: string;
  private readonly client: Anthropic;

  constructor(private readonly config: Config) {
    if (!config.ANTHROPIC_API_KEY) throw new AiUnavailableError('ANTHROPIC_API_KEY is not set');
    this.client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, maxRetries: 2 });
    this.model = config.AI_MODEL;
  }

  serverTools({ webSearch }: { webSearch: boolean }): ToolUnion[] {
    return webSearch ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }] : [];
  }

  private betaOptions() {
    return this.config.AI_REFUSAL_FALLBACK
      ? { betas: [FALLBACK_BETA] as Anthropic.Beta.AnthropicBeta[], fallbacks: 'default' as const }
      : {};
  }

  async createTurn(req: TurnRequest): Promise<TurnResponse> {
    const stream = this.client.beta.messages.stream(
      {
        model: this.model,
        max_tokens: req.maxTokens ?? this.config.AI_MAX_OUTPUT_TOKENS,
        thinking: { type: 'adaptive' },
        output_config: { effort: this.config.AI_EFFORT },
        // Stable system prompt is cached; history grows append-only behind it.
        system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
        cache_control: { type: 'ephemeral' },
        tools: req.tools,
        messages: req.messages,
        ...this.betaOptions(),
      },
      { signal: req.signal },
    );
    if (req.onTextDelta) stream.on('text', (delta) => req.onTextDelta!(delta));
    const message = await stream.finalMessage();
    return { content: message.content, stopReason: message.stop_reason };
  }

  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    let messages = [...req.messages];
    let content: Anthropic.Beta.Messages.BetaContentBlock[] = [];
    let stopReason: Anthropic.Beta.Messages.BetaStopReason | null = null;
    // Server tools may pause a long turn; resume a bounded number of times.
    for (let i = 0; i < 4; i++) {
      const stream = this.client.beta.messages.stream(
        {
          model: this.model,
          max_tokens: req.maxTokens ?? this.config.AI_MAX_OUTPUT_TOKENS,
          thinking: { type: 'adaptive' },
          output_config: { effort: this.config.AI_EFFORT },
          system: req.system,
          messages,
          ...(req.webSearch ? { tools: this.serverTools({ webSearch: true }) } : {}),
          ...this.betaOptions(),
        },
        { signal: req.signal },
      );
      const message = await stream.finalMessage();
      content = [...content, ...message.content];
      stopReason = message.stop_reason;
      if (message.stop_reason !== 'pause_turn') break;
      messages = [...messages, { role: 'assistant', content: message.content }];
    }
    if (stopReason === 'refusal') throw new AiRefusalError();
    return { text: textOf(content), content, stopReason };
  }
}

export function describeAiError(err: unknown): { code: string; message: string; retryable: boolean } {
  if (err instanceof AiUnavailableError) return { code: 'ai_unavailable', message: err.message, retryable: false };
  if (err instanceof AiRefusalError) return { code: 'ai_refused', message: err.message, retryable: false };
  if (err instanceof Anthropic.AuthenticationError) {
    return { code: 'ai_auth', message: 'The AI provider rejected the server credentials.', retryable: false };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { code: 'ai_rate_limited', message: 'The AI is busy right now. Please try again shortly.', retryable: true };
  }
  if (err instanceof Anthropic.BadRequestError) {
    return { code: 'ai_bad_request', message: 'The AI request was rejected.', retryable: false };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { code: 'ai_unreachable', message: 'Could not reach the AI provider.', retryable: true };
  }
  if (err instanceof Anthropic.APIError) {
    return { code: 'ai_error', message: 'The AI provider had a problem. Please retry.', retryable: true };
  }
  if (err instanceof Error && err.name === 'AbortError') {
    return { code: 'cancelled', message: 'Cancelled', retryable: true };
  }
  return { code: 'ai_error', message: 'Something went wrong while thinking.', retryable: true };
}
