import type Anthropic from '@anthropic-ai/sdk';

export type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
export type ContentBlock = Anthropic.Beta.Messages.BetaContentBlock;
export type ToolUnion = Anthropic.Beta.Messages.BetaToolUnion;
export type StopReason = Anthropic.Beta.Messages.BetaStopReason;

export interface TurnRequest {
  /** Frozen per conversation (prefix-stable for caching and preserved thinking). */
  system: string;
  messages: MessageParam[];
  tools: ToolUnion[];
  maxTokens?: number;
  onTextDelta?: (text: string) => void;
  signal?: AbortSignal;
}

export interface TurnResponse {
  content: ContentBlock[];
  stopReason: StopReason | null;
}

export interface CompleteRequest {
  system: string;
  messages: MessageParam[];
  maxTokens?: number;
  /** Enable Claude's server-side web search for this call. */
  webSearch?: boolean;
  signal?: AbortSignal;
}

export interface CompleteResponse {
  text: string;
  content: ContentBlock[];
  stopReason: StopReason | null;
}

/**
 * Abstraction over the LLM so the provider is configurable. The message
 * format follows the Claude Messages API, which the agent loop speaks
 * natively; another provider would adapt to it inside its implementation.
 */
export interface AiProvider {
  readonly name: string;
  readonly model: string | null;
  /** False when no credentials are configured; callers must degrade honestly. */
  readonly available: boolean;
  readonly supportsWebSearch: boolean;
  /** Server-side tool definitions this provider contributes (e.g. web search). */
  serverTools(opts: { webSearch: boolean }): ToolUnion[];
  createTurn(req: TurnRequest): Promise<TurnResponse>;
  complete(req: CompleteRequest): Promise<CompleteResponse>;
}

export class AiUnavailableError extends Error {
  constructor(message = 'The AI assistant is not configured on this server.') {
    super(message);
  }
}

export class AiRefusalError extends Error {
  constructor() {
    super('The AI declined to help with this request.');
  }
}

/** Used when AI_PROVIDER=none or no API key is configured. */
export class NoAiProvider implements AiProvider {
  readonly name = 'none';
  readonly model = null;
  readonly available = false;
  readonly supportsWebSearch = false;
  serverTools(): ToolUnion[] {
    return [];
  }
  createTurn(): Promise<TurnResponse> {
    return Promise.reject(new AiUnavailableError());
  }
  complete(): Promise<CompleteResponse> {
    return Promise.reject(new AiUnavailableError());
  }
}

export function textOf(content: ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/** Collect web sources from search results and citations, de-duplicated by URL. */
export function sourcesOf(content: ContentBlock[]): { title: string; url: string }[] {
  const seen = new Map<string, string>();
  for (const block of content) {
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const r of block.content) {
        if (r.type === 'web_search_result' && !seen.has(r.url)) seen.set(r.url, r.title || r.url);
      }
    }
    if (block.type === 'text' && block.citations) {
      for (const c of block.citations) {
        if (c.type === 'web_search_result_location' && !seen.has(c.url)) seen.set(c.url, c.title || c.url);
      }
    }
  }
  return [...seen.entries()].map(([url, title]) => ({ url, title }));
}
