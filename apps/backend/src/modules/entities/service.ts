import type { PrismaClient } from '@prisma/client';
import { buildEntity, entitySchemas, type EntityInput, type EntityMap, type EntityType } from '@aura/shared';
import { AppError, notFound } from '../../lib/errors';
import { uuid } from '../../lib/crypto';
import { delegateFor, toDto, toRowData, ENTITY_META } from './registry';

/**
 * Server-side CRUD for syncable entities, used by the agent's tools and by
 * automations. Writes go through the same schema validation as sync, and the
 * database trigger bumps version/seq so devices pull the change.
 * Every query is scoped by userId.
 */
export class EntityService {
  constructor(private readonly prisma: PrismaClient) {}

  async get<T extends EntityType>(userId: string, type: T, id: string): Promise<EntityMap[T] | null> {
    const row = await delegateFor(this.prisma, type).findFirst({ where: { id, userId, deletedAt: null } });
    return row ? toDto(type, row) : null;
  }

  async require<T extends EntityType>(userId: string, type: T, id: string): Promise<EntityMap[T]> {
    const found = await this.get(userId, type, id);
    if (!found) throw notFound(ENTITY_META[type].label);
    return found;
  }

  async list<T extends EntityType>(
    userId: string,
    type: T,
    opts: { where?: Record<string, unknown>; orderBy?: Record<string, unknown> | Record<string, unknown>[]; take?: number } = {},
  ): Promise<EntityMap[T][]> {
    const rows = await delegateFor(this.prisma, type).findMany({
      where: { ...opts.where, userId, deletedAt: null },
      orderBy: opts.orderBy ?? { createdAt: 'desc' },
      take: Math.min(opts.take ?? 100, 500),
    });
    return rows.map((r) => toDto(type, r));
  }

  async create<T extends EntityType>(
    userId: string,
    type: T,
    input: Partial<EntityInput<T>>,
    now = new Date(),
  ): Promise<EntityMap[T]> {
    const entity = buildEntity(type, uuid(), input, now);
    const valid = this.validate(type, entity);
    const row = await delegateFor(this.prisma, type).create({
      data: { ...toRowData(type, valid as Record<string, unknown>), userId },
    });
    return toDto(type, row);
  }

  async update<T extends EntityType>(
    userId: string,
    type: T,
    id: string,
    patch: Partial<EntityInput<T>>,
    now = new Date(),
  ): Promise<EntityMap[T]> {
    const current = await this.require(userId, type, id);
    const merged = { ...current, ...patch, updatedAt: now.toISOString() };
    const valid = this.validate(type, merged);
    const row = await delegateFor(this.prisma, type).update({
      where: { id },
      data: toRowData(type, valid as Record<string, unknown>),
    });
    return toDto(type, row);
  }

  async softDelete(userId: string, type: EntityType, id: string, now = new Date()): Promise<void> {
    await this.require(userId, type, id);
    await delegateFor(this.prisma, type).update({
      where: { id },
      data: { deletedAt: now, updatedAt: now },
    });
  }

  private validate<T extends EntityType>(type: T, value: unknown): EntityMap[T] {
    const result = entitySchemas[type].safeParse(value);
    if (!result.success) {
      throw new AppError(
        400,
        'validation_error',
        `Invalid ${ENTITY_META[type].label.toLowerCase()}`,
        result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    return result.data as EntityMap[T];
  }
}
