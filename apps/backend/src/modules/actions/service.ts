import type { PendingAction as Row, PrismaClient } from '@prisma/client';
import { toolLabel, type PendingAction } from '@aura/shared';
import { AppError, notFound } from '../../lib/errors';
import type { ToolExecutor } from '../agent/tools';
import type { AgentService } from '../agent/service';
import type { PreferencesService } from '../preferences/service';

export function pendingActionDto(a: Row): PendingAction {
  return {
    id: a.id,
    toolName: a.toolName,
    label: a.label,
    description: a.description,
    input: (a.input ?? {}) as Record<string, unknown>,
    status: a.status as PendingAction['status'],
    result: a.result,
    conversationId: a.conversationId,
    createdAt: a.createdAt.toISOString(),
    expiresAt: a.expiresAt.toISOString(),
  };
}

/**
 * Confirmation gate for consequential tool calls. The agent can only *propose*
 * these; they execute exclusively through confirm(), which is triggered by an
 * authenticated request from the user's device.
 */
export class PendingActionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly executor: ToolExecutor,
    private readonly agent: AgentService,
    private readonly preferences: PreferencesService,
  ) {}

  async list(userId: string, status: 'pending' | 'all' = 'pending') {
    await this.expireOld(userId);
    const rows = await this.prisma.pendingAction.findMany({
      where: { userId, ...(status === 'pending' ? { status: 'pending' } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map(pendingActionDto);
  }

  async get(userId: string, id: string) {
    const a = await this.prisma.pendingAction.findFirst({ where: { id, userId } });
    if (!a) throw notFound('Action');
    return pendingActionDto(a);
  }

  async confirm(userId: string, id: string, now = new Date()): Promise<PendingAction> {
    // Claim atomically so a double tap cannot execute twice.
    const claimed = await this.prisma.pendingAction.updateMany({
      where: { id, userId, status: 'pending', expiresAt: { gt: now } },
      data: { status: 'confirmed', decidedAt: now },
    });
    if (claimed.count === 0) {
      const existing = await this.prisma.pendingAction.findFirst({ where: { id, userId } });
      if (!existing) throw notFound('Action');
      if (existing.status === 'pending') {
        await this.prisma.pendingAction.update({ where: { id }, data: { status: 'expired' } });
        throw new AppError(410, 'action_expired', 'This request expired. Ask again if you still want it.');
      }
      throw new AppError(409, 'action_already_decided', `This action was already ${existing.status}`);
    }

    const action = await this.prisma.pendingAction.findUniqueOrThrow({ where: { id } });
    const prefs = await this.preferences.get(userId);
    const outcome = await this.executor.run(
      action.toolName,
      action.input,
      { userId, prefs, now, source: 'chat', conversationId: action.conversationId },
      { confirmed: true },
    );
    const succeeded = outcome.status === 'succeeded';
    const updated = await this.prisma.pendingAction.update({
      where: { id },
      data: { status: succeeded ? 'confirmed' : 'failed', result: outcome.summary },
    });
    if (action.conversationId) {
      await this.agent.addEvent(userId, action.conversationId, succeeded ? `User confirmed: ${outcome.summary}` : `User confirmed “${action.description}”, but it failed: ${outcome.summary}`, {
        id: action.id,
        name: action.toolName,
        label: toolLabel(action.toolName),
        status: succeeded ? 'succeeded' : 'failed',
        summary: outcome.summary,
        pendingActionId: action.id,
        display: null,
      });
    }
    return pendingActionDto(updated);
  }

  async reject(userId: string, id: string, now = new Date()): Promise<PendingAction> {
    const claimed = await this.prisma.pendingAction.updateMany({
      where: { id, userId, status: 'pending' },
      data: { status: 'rejected', decidedAt: now, result: 'Cancelled by user' },
    });
    if (claimed.count === 0) {
      const existing = await this.prisma.pendingAction.findFirst({ where: { id, userId } });
      if (!existing) throw notFound('Action');
      throw new AppError(409, 'action_already_decided', `This action was already ${existing.status}`);
    }
    const action = await this.prisma.pendingAction.findUniqueOrThrow({ where: { id } });
    if (action.conversationId) {
      await this.agent.addEvent(userId, action.conversationId, `User cancelled: ${action.description}`, {
        id: action.id,
        name: action.toolName,
        label: toolLabel(action.toolName),
        status: 'rejected',
        summary: `Cancelled: ${action.description}`,
        pendingActionId: action.id,
        display: null,
      });
    }
    return pendingActionDto(action);
  }

  private async expireOld(userId: string) {
    await this.prisma.pendingAction.updateMany({
      where: { userId, status: 'pending', expiresAt: { lte: new Date() } },
      data: { status: 'expired' },
    });
  }
}
