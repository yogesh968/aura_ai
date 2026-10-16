import type { Conversation as ConversationRow, Message as MessageRow, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  AUTOMATION_ONLY_TOOLS,
  toolDefinitions,
  toolLabel,
  toolNames,
  type ChatMessage,
  type ChatStreamEvent,
  type Conversation,
  type SendMessageInput,
  type Source,
  type ToolCallSummary,
} from '@aura/shared';
import type { Config } from '../../config';
import { AppError, notFound } from '../../lib/errors';
import { describeAiError } from '../ai/anthropic';
import { sourcesOf, textOf, type AiProvider, type ContentBlock, type MessageParam, type ToolUnion } from '../ai/provider';
import type { DocumentService } from '../documents/service';
import type { MemoryService } from '../memory/service';
import type { PreferencesService } from '../preferences/service';
import { buildTurnContext, COMPACTION_PROMPT, SYSTEM_PROMPT } from './prompts';
import type { ToolExecutor } from './tools';

type UserContent = Exclude<MessageParam['content'], string>;
type ToolResultParam = Extract<UserContent[number], { type: 'tool_result' }>;
type ToolUseBlock = Extract<ContentBlock, { type: 'tool_use' }>;

/** Approximate size at which a conversation is compacted (characters of replayed JSON). */
const COMPACTION_THRESHOLD_CHARS = 600_000;

/** Client tool definitions for the model: the shared catalog minus automation-only tools. Stable order. */
export function agentToolDefinitions(): ToolUnion[] {
  return toolNames
    .filter((n) => !AUTOMATION_ONLY_TOOLS.includes(n))
    .map((name) => {
      const def = toolDefinitions[name];
      const { $schema: _ignored, ...schema } = z.toJSONSchema(def.input, { io: 'input' }) as Record<string, unknown>;
      return {
        name,
        description: def.permission === 'confirm' ? `${def.description} (The user must confirm in the app before it runs.)` : def.description,
        input_schema: schema as { type: 'object'; properties?: Record<string, unknown> },
        // Inputs stream as generated; every input is validated with Zod before execution.
        eager_input_streaming: true,
      };
    });
}

export function conversationDto(c: ConversationRow & { messages?: { text: string }[] }): Conversation {
  return {
    id: c.id,
    title: c.title,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    lastMessagePreview: c.messages?.[0]?.text.slice(0, 140) ?? null,
  };
}

export function messageDto(m: MessageRow): ChatMessage {
  return {
    id: m.id,
    conversationId: m.conversationId,
    role: m.role as ChatMessage['role'],
    text: m.text,
    toolCalls: (m.toolCalls as ToolCallSummary[]) ?? [],
    sources: (m.sources as Source[]) ?? [],
    status: m.status as ChatMessage['status'],
    createdAt: m.createdAt.toISOString(),
  };
}

interface AgentDeps {
  prisma: PrismaClient;
  ai: AiProvider;
  executor: ToolExecutor;
  memory: MemoryService;
  preferences: PreferencesService;
  documents: DocumentService;
  config: Pick<Config, 'AI_MAX_TOOL_ITERATIONS'>;
  now?: () => Date;
}

/**
 * The conversation engine.
 *
 * Each user message runs a bounded agent loop: the model may call typed tools
 * (validated, permission-checked and audited by ToolExecutor) for up to
 * AI_MAX_TOOL_ITERATIONS rounds. History is append-only: the exact API
 * messages of every turn are stored and replayed verbatim, the system prompt
 * and tool set never change within a conversation, and per-turn context
 * (time, preferences, memories, confirmed actions) is added to the new user
 * turn rather than edited into earlier ones. Long conversations are compacted
 * into a summary that starts a fresh replay window.
 */
export class AgentService {
  constructor(private readonly d: AgentDeps) {}

  private now() {
    return this.d.now ? this.d.now() : new Date();
  }

  async createConversation(userId: string, title?: string) {
    const prefs = await this.d.preferences.get(userId);
    const c = await this.d.prisma.conversation.create({
      data: {
        userId,
        title: title?.trim().slice(0, 80) || 'New conversation',
        webSearch: prefs.webSearchEnabled && this.d.ai.supportsWebSearch,
      },
    });
    return conversationDto(c);
  }

  async listConversations(userId: string, limit = 30, before?: string) {
    const rows = await this.d.prisma.conversation.findMany({
      where: { userId, ...(before ? { updatedAt: { lt: new Date(before) } } : {}) },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: { messages: { where: { role: { in: ['user', 'assistant'] } }, orderBy: { createdAt: 'desc' }, take: 1, select: { text: true } } },
    });
    return rows.map(conversationDto);
  }

  async getConversation(userId: string, id: string) {
    const c = await this.d.prisma.conversation.findFirst({ where: { id, userId } });
    if (!c) throw notFound('Conversation');
    return c;
  }

  async messages(userId: string, conversationId: string, limit = 100) {
    await this.getConversation(userId, conversationId);
    const rows = await this.d.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.reverse().map(messageDto);
  }

  async renameConversation(userId: string, id: string, title: string) {
    await this.getConversation(userId, id);
    return conversationDto(await this.d.prisma.conversation.update({ where: { id }, data: { title: title.slice(0, 80) } }));
  }

  async deleteConversation(userId: string, id: string) {
    const { count } = await this.d.prisma.conversation.deleteMany({ where: { id, userId } });
    if (count === 0) throw notFound('Conversation');
  }

  /** Append a server note (e.g. "user confirmed: deleted task X"); it is shown in chat and given to the model next turn. */
  async addEvent(userId: string, conversationId: string, text: string, toolCall?: ToolCallSummary) {
    const exists = await this.d.prisma.conversation.findFirst({ where: { id: conversationId, userId }, select: { id: true } });
    if (!exists) return null;
    const m = await this.d.prisma.message.create({
      data: { conversationId, userId, role: 'event', text, toolCalls: (toolCall ? [toolCall] : []) as object[] },
    });
    await this.d.prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    return messageDto(m);
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    input: SendMessageInput,
    emit: (e: ChatStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<ChatMessage> {
    const conversation = await this.getConversation(userId, conversationId);

    // Idempotent retries: the same clientMessageId never runs the agent twice.
    if (input.clientMessageId) {
      const dup = await this.d.prisma.message.findUnique({
        where: { userId_clientMessageId: { userId, clientMessageId: input.clientMessageId } },
      });
      if (dup) {
        const reply = await this.d.prisma.message.findFirst({
          where: { conversationId, role: 'assistant', createdAt: { gte: dup.createdAt } },
          orderBy: { createdAt: 'asc' },
        });
        if (reply) {
          emit({ type: 'done', message: messageDto(reply) });
          return messageDto(reply);
        }
      }
    }

    if (!this.d.ai.available) {
      throw new AppError(
        503,
        'ai_unavailable',
        'AI chat is not configured on this server. Your tasks, notes and other offline features still work.',
      );
    }

    const now = this.now();
    const [user, prefs, memories] = await Promise.all([
      this.d.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } }),
      this.d.preferences.get(userId),
      this.d.memory.forContext(userId),
    ]);

    // ---- History (append-only replay) ------------------------------------
    const rows = await this.d.prisma.message.findMany({
      where: { conversationId, ...(conversation.replayFrom ? { createdAt: { gte: conversation.replayFrom } } : {}) },
      orderBy: { createdAt: 'asc' },
    });
    const lastUserIdx = rows.map((r) => r.role).lastIndexOf('user');
    const events = rows.slice(lastUserIdx + 1).filter((r) => r.role === 'event').map((r) => r.text);
    let history: MessageParam[] = rows
      .filter((r) => r.role !== 'event')
      .flatMap((r) => (r.apiMessages as unknown as MessageParam[]) ?? []);

    // ---- Compaction --------------------------------------------------------
    let summaryBlock: string | null = null;
    if (JSON.stringify(history).length > COMPACTION_THRESHOLD_CHARS) {
      const transcript = rows
        .filter((r) => r.role !== 'event' || r.text)
        .map((r) => `${r.role.toUpperCase()}: ${r.text}`)
        .join('\n\n')
        .slice(-200_000);
      try {
        const res = await this.d.ai.complete({
          system: COMPACTION_PROMPT,
          messages: [{ role: 'user', content: transcript }],
          maxTokens: 4000,
          signal,
        });
        summaryBlock = `<conversation_summary>\n${res.text.trim()}\n</conversation_summary>`;
        history = [];
      } catch {
        // Compaction failed: keep the most recent part of the window.
        history = history.slice(-40);
        while (history.length && (history[0]!.role !== 'user' || hasToolResult(history[0]!))) history.shift();
      }
    }

    // ---- The new user turn ---------------------------------------------------
    const contextText = buildTurnContext({
      now,
      prefs,
      userName: user.name,
      memories,
      inputMode: input.inputMode,
      webSearch: conversation.webSearch,
      events,
    });
    const content: UserContent = [{ type: 'text', text: summaryBlock ? `${summaryBlock}\n${contextText}` : contextText }];
    for (const att of input.attachments ?? []) content.push(...(await this.d.documents.contentBlocks(userId, att.documentId)));
    content.push({ type: 'text', text: input.text });
    const userParam: MessageParam = { role: 'user', content };

    const userRow = await this.d.prisma.message.create({
      data: {
        conversationId,
        userId,
        role: 'user',
        text: input.text,
        apiMessages: [userParam] as object[],
        clientMessageId: input.clientMessageId ?? null,
        createdAt: now,
      },
    });
    if (summaryBlock) {
      await this.d.prisma.conversation.update({ where: { id: conversationId }, data: { replayFrom: userRow.createdAt } });
    }
    emit({ type: 'user_message', message: messageDto(userRow) });

    // ---- Agent loop ----------------------------------------------------------
    const tools = [...agentToolDefinitions(), ...this.d.ai.serverTools({ webSearch: conversation.webSearch })];
    const turn: MessageParam[] = []; // assistant/tool_result messages produced in this turn
    const toolCalls: ToolCallSummary[] = [];
    const sources = new Map<string, Source>();
    const texts: string[] = [];
    let status: ChatMessage['status'] = 'complete';
    let errorText: string | null = null;

    try {
      for (let iteration = 0; ; iteration++) {
        if (iteration >= this.d.config.AI_MAX_TOOL_ITERATIONS) {
          texts.push(`I stopped after ${iteration} steps to stay within safe limits. Tell me if you'd like me to continue.`);
          break;
        }
        const res = await this.d.ai.createTurn({
          system: SYSTEM_PROMPT,
          messages: [...history, userParam, ...turn],
          tools,
          signal,
          onTextDelta: (t) => emit({ type: 'text_delta', text: t }),
        });

        if (res.stopReason === 'refusal') {
          // Never persist a refused (possibly partial) response; nothing it proposed is executed.
          texts.push("Sorry, I can't help with that request.");
          break;
        }
        for (const s of sourcesOf(res.content)) sources.set(s.url, s);
        const text = textOf(res.content).trim();
        const toolUses = res.content.filter((b): b is ToolUseBlock => b.type === 'tool_use');

        if (res.stopReason === 'max_tokens' && toolUses.length > 0) {
          // A tool call cut off mid-input is never executed.
          if (text) texts.push(text);
          texts.push('My response was cut off before I could finish. Please try a shorter request.');
          status = 'error';
          break;
        }

        if (text) texts.push(text);
        if (res.stopReason === 'pause_turn') {
          turn.push({ role: 'assistant', content: res.content });
          continue;
        }

        if (toolUses.length === 0) {
          turn.push({ role: 'assistant', content: res.content });
          break;
        }

        const results: ToolResultParam[] = [];
        for (const use of toolUses) {
          emit({ type: 'tool_start', id: use.id, name: use.name, label: toolLabel(use.name) });
          const outcome = await this.d.executor.run(use.name, use.input, {
            userId,
            prefs,
            now: this.now(),
            source: 'chat',
            conversationId,
          });
          for (const s of outcome.sources ?? []) sources.set(s.url, s);
          const summary: ToolCallSummary = {
            id: use.id,
            name: use.name,
            label: toolLabel(use.name),
            status: outcome.status,
            summary: outcome.summary,
            pendingActionId: outcome.pendingActionId ?? null,
            display: outcome.display ?? null,
          };
          toolCalls.push(summary);
          emit({ type: 'tool_end', call: summary });
          results.push({
            type: 'tool_result',
            tool_use_id: use.id,
            content: outcome.modelResult,
            ...(outcome.status === 'failed' ? { is_error: true } : {}),
          });
          if (signal?.aborted) break;
        }
        if (results.length < toolUses.length) {
          // Cancelled mid-round: answer the remaining calls so the history stays well-formed.
          for (const use of toolUses.slice(results.length)) {
            results.push({ type: 'tool_result', tool_use_id: use.id, content: 'Cancelled by the user before running.', is_error: true });
          }
        }
        turn.push({ role: 'assistant', content: res.content }, { role: 'user', content: results });
        if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      }
    } catch (err) {
      const info = describeAiError(err);
      status = info.code === 'cancelled' ? 'cancelled' : 'error';
      errorText = info.code === 'cancelled' ? 'Stopped.' : info.message;
      if (info.code !== 'cancelled') emit({ type: 'error', code: info.code, message: info.message });
      // Keep history well-formed: drop a trailing assistant message whose tool calls never got results.
      const last = turn[turn.length - 1];
      if (last?.role === 'assistant' && Array.isArray(last.content) && last.content.some((b) => b.type === 'tool_use')) turn.pop();
    }

    const sourceList = [...sources.values()];
    if (sourceList.length) emit({ type: 'sources', sources: sourceList });

    const finalText = [...texts, ...(errorText ? [errorText] : [])].join('\n\n').trim();
    const assistantRow = await this.d.prisma.message.create({
      data: {
        conversationId,
        userId,
        role: 'assistant',
        text: finalText || (toolCalls.length ? 'Done.' : ''),
        apiMessages: turn as object[],
        toolCalls: toolCalls as object[],
        sources: sourceList,
        status,
        createdAt: new Date(Math.max(this.now().getTime(), now.getTime() + 1)),
      },
    });

    const isFirst = rows.filter((r) => r.role === 'user').length === 0 && !conversation.replayFrom;
    await this.d.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        updatedAt: new Date(),
        ...(isFirst && conversation.title === 'New conversation' ? { title: autoTitle(input.text) } : {}),
      },
    });

    const dto = messageDto(assistantRow);
    emit({ type: 'done', message: dto });
    return dto;
  }
}

function hasToolResult(m: MessageParam) {
  return Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_result');
}

function autoTitle(text: string) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= 48 ? clean : `${clean.slice(0, 45).replace(/\s+\S*$/, '')}…`;
}
