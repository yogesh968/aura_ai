import type { Memory as MemoryRow, PrismaClient } from '@prisma/client';
import type { Memory } from '@aura/shared';
import { notFound } from '../../lib/errors';

export function memoryDto(m: MemoryRow): Memory {
  return {
    id: m.id,
    content: m.content,
    category: m.category as Memory['category'],
    source: m.source as Memory['source'],
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

/**
 * User-controlled long-term memory. The assistant can only add memories
 * through a confirmation-gated tool; users can review, edit and delete all of
 * them, and can disable memory use entirely in preferences.
 */
export class MemoryService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(userId: string): Promise<Memory[]> {
    const rows = await this.prisma.memory.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take: 500 });
    return rows.map(memoryDto);
  }

  async create(userId: string, input: { content: string; category: string; source: 'user' | 'assistant' }) {
    const existing = await this.prisma.memory.findFirst({
      where: { userId, content: { equals: input.content, mode: 'insensitive' } },
    });
    if (existing) return memoryDto(existing);
    return memoryDto(await this.prisma.memory.create({ data: { ...input, userId } }));
  }

  async update(userId: string, id: string, patch: { content?: string; category?: string }) {
    const found = await this.prisma.memory.findFirst({ where: { id, userId } });
    if (!found) throw notFound('Memory');
    return memoryDto(await this.prisma.memory.update({ where: { id }, data: patch }));
  }

  async remove(userId: string, id: string) {
    const { count } = await this.prisma.memory.deleteMany({ where: { id, userId } });
    if (count === 0) throw notFound('Memory');
  }

  async removeAll(userId: string) {
    const { count } = await this.prisma.memory.deleteMany({ where: { userId } });
    return count;
  }

  /** Memories to include in the assistant's context (most recent first, bounded). */
  async forContext(userId: string, limit = 40): Promise<Memory[]> {
    const rows = await this.prisma.memory.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take: limit });
    return rows.map(memoryDto);
  }
}
