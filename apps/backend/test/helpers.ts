import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { buildEntity, type EntityInput, type EntityType } from '@aura/shared';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import type {
  AiProvider,
  CompleteRequest,
  CompleteResponse,
  ContentBlock,
  ToolUnion,
  TurnRequest,
  TurnResponse,
} from '../src/modules/ai/provider';

export const prisma = new PrismaClient();

type Step = (req: TurnRequest) => TurnResponse | Promise<TurnResponse>;

/**
 * Deterministic stand-in for the LLM. Each createTurn() call consumes the next
 * scripted step; every request is recorded so tests can assert on exactly
 * what would have been sent to the model.
 */
export class ScriptedAi implements AiProvider {
  readonly name = 'scripted';
  readonly model = 'scripted-model';
  readonly available = true;
  readonly supportsWebSearch = false;
  readonly turns: TurnRequest[] = [];
  readonly completions: CompleteRequest[] = [];
  private steps: Step[] = [];
  completeText = 'Scripted completion.';

  script(...steps: Step[]) {
    this.steps.push(...steps);
    return this;
  }
  serverTools(): ToolUnion[] {
    return [];
  }
  async createTurn(req: TurnRequest): Promise<TurnResponse> {
    // Snapshot: the agent mutates nothing, but copy to be safe.
    this.turns.push(JSON.parse(JSON.stringify({ ...req, onTextDelta: undefined, signal: undefined })));
    const step = this.steps.shift();
    if (!step) throw new Error('ScriptedAi: no scripted response left');
    const res = await step(req);
    for (const b of res.content) if (b.type === 'text') req.onTextDelta?.(b.text);
    return res;
  }
  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    this.completions.push(req);
    return { text: this.completeText, content: [text(this.completeText)], stopReason: 'end_turn' };
  }
}

export function text(t: string): ContentBlock {
  return { type: 'text', text: t, citations: null } as ContentBlock;
}

export function toolUse(name: string, input: Record<string, unknown>, id = `toolu_${randomUUID().slice(0, 8)}`): ContentBlock {
  return { type: 'tool_use', id, name, input, caller: { type: 'direct' } } as unknown as ContentBlock;
}

export const reply = (...content: ContentBlock[]): TurnResponse => ({
  content,
  stopReason: content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn',
});

export async function makeApp(opts: { ai?: AiProvider; fetch?: typeof fetch } = {}): Promise<FastifyInstance> {
  const config = loadConfig();
  return buildApp(config, prisma, opts);
}

let counter = 0;
export async function registerUser(app: FastifyInstance, name = 'Test User') {
  const email = `user${Date.now()}${counter++}@example.com`;
  const res = await app.inject({ method: 'POST', url: '/v1/auth/register', payload: { email, password: 'correct-horse-1', name } });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.body}`);
  const body = res.json();
  return { ...body, email, auth: { authorization: `Bearer ${body.accessToken}` } } as {
    user: { id: string };
    accessToken: string;
    refreshToken: string;
    email: string;
    auth: { authorization: string };
  };
}

export function entity<T extends EntityType>(type: T, input: Partial<EntityInput<T>>, now = new Date()) {
  return buildEntity(type, randomUUID(), input, now);
}

/** Parse an SSE body into events. */
export function parseSse(body: string): { type: string; [k: string]: unknown }[] {
  return body
    .split('\n\n')
    .map((chunk) => chunk.split('\n').find((l) => l.startsWith('data: ')))
    .filter((l): l is string => Boolean(l))
    .map((l) => JSON.parse(l.slice(6)));
}
