import type { PrismaClient } from '@prisma/client';
import { entitySchemas, type EntityMap, type EntityType } from '@aura/shared';

/**
 * Maps each syncable entity type to its Prisma delegate and the fields that
 * need conversion between the wire format (ISO strings, numbers) and the
 * database (DateTime, BigInt).
 */
interface EntityMeta {
  delegate: string;
  dateFields: string[];
  bigintFields: string[];
  label: string;
}

export const ENTITY_META: Record<EntityType, EntityMeta> = {
  task: { delegate: 'task', dateFields: ['dueAt', 'remindAt', 'completedAt'], bigintFields: [], label: 'Task' },
  event: { delegate: 'calendarEvent', dateFields: ['startAt', 'endAt'], bigintFields: [], label: 'Event' },
  reminder: { delegate: 'reminder', dateFields: ['remindAt'], bigintFields: [], label: 'Reminder' },
  note: { delegate: 'note', dateFields: [], bigintFields: [], label: 'Note' },
  project: { delegate: 'project', dateFields: ['deadline'], bigintFields: [], label: 'Project' },
  habit: { delegate: 'habit', dateFields: [], bigintFields: [], label: 'Habit' },
  habitLog: { delegate: 'habitLog', dateFields: [], bigintFields: [], label: 'Habit log' },
  wellness: { delegate: 'wellnessEntry', dateFields: [], bigintFields: [], label: 'Wellness entry' },
  transaction: {
    delegate: 'financeTransaction',
    dateFields: ['occurredAt'],
    bigintFields: ['amountMinor'],
    label: 'Transaction',
  },
  budget: { delegate: 'budget', dateFields: [], bigintFields: ['limitMinor'], label: 'Budget' },
  recurringPayment: {
    delegate: 'recurringPayment',
    dateFields: ['nextDueAt'],
    bigintFields: ['amountMinor'],
    label: 'Bill',
  },
  goal: { delegate: 'goal', dateFields: ['deadline'], bigintFields: [], label: 'Goal' },
  routine: { delegate: 'routine', dateFields: [], bigintFields: [], label: 'Routine' },
};

const ENVELOPE_DATES = ['createdAt', 'updatedAt', 'deletedAt'];

/** Minimal structural type shared by all entity delegates. */
export interface EntityDelegate {
  findUnique(args: { where: { id: string } }): Promise<Row | null>;
  findFirst(args: Record<string, unknown>): Promise<Row | null>;
  findMany(args: Record<string, unknown>): Promise<Row[]>;
  create(args: { data: Record<string, unknown> }): Promise<Row>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<Row>;
  count(args: Record<string, unknown>): Promise<number>;
  deleteMany(args: Record<string, unknown>): Promise<{ count: number }>;
}

export type Row = Record<string, unknown> & { id: string; userId: string; version: number; seq: bigint };

export function delegateFor(prisma: PrismaClient, type: EntityType): EntityDelegate {
  return (prisma as unknown as Record<string, EntityDelegate>)[ENTITY_META[type].delegate]!;
}

/** Database row -> wire DTO. Strips userId/seq, converts Dates and BigInts. */
export function toDto<T extends EntityType>(type: T, row: Row): EntityMap[T] {
  const meta = ENTITY_META[type];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'userId' || k === 'seq') continue;
    if (v instanceof Date) out[k] = v.toISOString();
    else if (typeof v === 'bigint') out[k] = Number(v);
    else out[k] = v;
  }
  for (const f of [...meta.dateFields, ...ENVELOPE_DATES]) if (!(f in out)) out[f] = null;
  return out as EntityMap[T];
}

/** Wire DTO -> Prisma data. Only keys present in the entity schema are copied. */
export function toRowData(type: EntityType, dto: Record<string, unknown>): Record<string, unknown> {
  const meta = ENTITY_META[type];
  const shape = entitySchemas[type].shape as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const key of Object.keys(shape)) {
    if (key === 'version' || !(key in dto)) continue;
    const v = dto[key];
    if ((meta.dateFields.includes(key) || ENVELOPE_DATES.includes(key)) && typeof v === 'string') {
      data[key] = new Date(v);
    } else if (meta.bigintFields.includes(key) && typeof v === 'number') {
      data[key] = BigInt(Math.round(v));
    } else {
      data[key] = v;
    }
  }
  return data;
}
