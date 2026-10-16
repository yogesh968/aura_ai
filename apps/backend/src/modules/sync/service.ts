import type { PrismaClient } from '@prisma/client';
import {
  entitySchemas,
  entityTypes,
  type SyncChange,
  type SyncPullResponse,
  type SyncResult,
} from '@aura/shared';
import { delegateFor, toDto, toRowData, type Row } from '../entities/registry';

/**
 * Offline-first sync.
 *
 * Push: the device sends its queued mutations with the server version it last
 * saw (`baseVersion`). If the server row changed since then, the newer
 * `updatedAt` (client modification time) wins — last-writer-wins per record —
 * and the device receives the winning record either way.
 *
 * Pull: rows carry a global `seq` assigned by a DB trigger on every write, so
 * "everything after cursor N" is a simple indexed range query.
 */
export class SyncService {
  constructor(private readonly prisma: PrismaClient) {}

  async push(userId: string, changes: SyncChange[]): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    for (const change of changes) {
      try {
        results.push(await this.applyChange(userId, change));
      } catch (err) {
        results.push({
          type: change.type,
          id: String(change.data.id ?? ''),
          status: 'rejected',
          record: null,
          error: err instanceof Error ? err.message.slice(0, 300) : 'Unknown error',
        });
      }
    }
    return results;
  }

  private async applyChange(userId: string, change: SyncChange): Promise<SyncResult> {
    const { type } = change;
    const delegate = delegateFor(this.prisma, type);
    const id = String(change.data.id ?? '');
    const reject = (error: string): SyncResult => ({ type, id, status: 'rejected', record: null, error });

    if (!/^[0-9a-f-]{36}$/i.test(id)) return reject('Invalid id');
    const existing = await delegate.findUnique({ where: { id } });
    if (existing && existing.userId !== userId) return reject('Not found');

    if (change.op === 'delete') {
      const deletedAt = typeof change.data.deletedAt === 'string' ? new Date(change.data.deletedAt) : new Date();
      const updatedAt = typeof change.data.updatedAt === 'string' ? new Date(change.data.updatedAt) : deletedAt;
      if (!existing) return { type, id, status: 'applied', record: null };
      if (existing.deletedAt) return { type, id, status: 'applied', record: toDto(type, existing) };
      if (existing.version > change.baseVersion && (existing.updatedAt as Date) > updatedAt) {
        // Edited elsewhere after this device last synced, and more recently than the delete.
        return { type, id, status: 'conflict_server_won', record: toDto(type, existing) };
      }
      const row = await delegate.update({ where: { id }, data: { deletedAt, updatedAt } });
      return { type, id, status: 'applied', record: toDto(type, row) };
    }

    const parsed = entitySchemas[type].safeParse(change.data);
    if (!parsed.success) {
      return reject(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ').slice(0, 300));
    }
    const data = toRowData(type, parsed.data as Record<string, unknown>);

    if (!existing) {
      const row = await delegate.create({ data: { ...data, userId } });
      return { type, id, status: 'applied', record: toDto(type, row) };
    }

    if (existing.deletedAt) {
      // Deleted on the server: a delete wins over a concurrent edit.
      return { type, id, status: 'conflict_server_won', record: toDto(type, existing) };
    }

    const conflicted = existing.version > change.baseVersion;
    if (conflicted && (existing.updatedAt as Date) >= (data.updatedAt as Date)) {
      return { type, id, status: 'conflict_server_won', record: toDto(type, existing) };
    }
    const { id: _id, createdAt: _c, ...updateData } = data;
    const row = await delegate.update({ where: { id }, data: updateData });
    return { type, id, status: conflicted ? 'conflict_client_won' : 'applied', record: toDto(type, row) };
  }

  async pull(userId: string, since: number, limit: number): Promise<SyncPullResponse> {
    const perType = await Promise.all(
      entityTypes.map(async (type) => {
        const rows = await delegateFor(this.prisma, type).findMany({
          where: { userId, seq: { gt: BigInt(since) } },
          orderBy: { seq: 'asc' },
          take: limit + 1,
        });
        return rows.map((row: Row) => ({ type, row }));
      }),
    );
    const merged = perType.flat().sort((a, b) => (a.row.seq < b.row.seq ? -1 : a.row.seq > b.row.seq ? 1 : 0));
    const page = merged.slice(0, limit);
    const cursor = page.length > 0 ? Number(page[page.length - 1]!.row.seq) : since;
    return {
      changes: page.map(({ type, row }) => ({ type, record: toDto(type, row) as Record<string, unknown> })),
      cursor,
      hasMore: merged.length > limit,
    };
  }
}
