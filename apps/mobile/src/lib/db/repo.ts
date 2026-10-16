import * as Crypto from 'expo-crypto';
import {
  buildEntity,
  entitySchemas,
  type EntityInput,
  type EntityMap,
  type EntityType,
} from '@aura/shared';
import { getDb } from './database';

/**
 * Offline-first repository for syncable entities.
 *
 * All writes happen locally first (instant, works offline), are validated
 * with the same Zod schemas the server uses, and are queued in the outbox for
 * the sync engine. Listeners are notified so screens refresh immediately.
 */

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly fields: Record<string, string>,
  ) {
    super(message);
  }
}

type Listener = (types: EntityType[]) => void;
const listeners = new Set<Listener>();

export function subscribeToChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let localWriteHook: (() => void) | null = null;
/** Called after every local write (the sync engine uses it to schedule a push). */
export function setLocalWriteHook(hook: (() => void) | null) {
  localWriteHook = hook;
}

export function notifyChanged(types: EntityType[]) {
  if (types.length === 0) return;
  for (const l of listeners) l(types);
}

interface Row {
  data: string;
  version: number;
  dirty: number;
  deleted: number;
}

function validate<T extends EntityType>(type: T, value: unknown): EntityMap[T] {
  const result = entitySchemas[type].safeParse(value);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) fields[issue.path.join('.') || 'form'] = issue.message;
    const first = result.error.issues[0];
    throw new ValidationError(first ? `${first.path.join('.') || 'Value'}: ${first.message}` : 'Invalid data', fields);
  }
  return result.data as EntityMap[T];
}

export async function listEntities<T extends EntityType>(type: T): Promise<EntityMap[T][]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>('SELECT data FROM entities WHERE type = ? AND deleted = 0', type);
  return rows.map((r) => JSON.parse(r.data) as EntityMap[T]);
}

export async function getEntity<T extends EntityType>(type: T, id: string): Promise<EntityMap[T] | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Row>('SELECT data FROM entities WHERE type = ? AND id = ? AND deleted = 0', type, id);
  return row ? (JSON.parse(row.data) as EntityMap[T]) : null;
}

async function writeLocal<T extends EntityType>(type: T, record: EntityMap[T], op: 'upsert' | 'delete') {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const existing = await tx.getFirstAsync<{ version: number }>('SELECT version FROM entities WHERE type = ? AND id = ?', type, record.id);
    const baseVersion = existing?.version ?? 0;
    await tx.runAsync(
      `INSERT INTO entities (type, id, data, updated_at, deleted, version, dirty) VALUES (?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(type, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted, dirty = 1`,
      type,
      record.id,
      JSON.stringify(record),
      record.updatedAt,
      op === 'delete' ? 1 : 0,
      baseVersion,
    );
    // Coalesce: only the latest pending mutation per record needs to be sent.
    await tx.runAsync('DELETE FROM outbox WHERE type = ? AND id = ? AND attempts = 0', type, record.id);
    await tx.runAsync(
      'INSERT INTO outbox (type, id, op, data, base_version, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      type,
      record.id,
      op,
      JSON.stringify(record),
      baseVersion,
      new Date().toISOString(),
    );
  });
  notifyChanged([type]);
  localWriteHook?.();
}

export async function createEntity<T extends EntityType>(type: T, input: Partial<EntityInput<T>>): Promise<EntityMap[T]> {
  const record = validate(type, buildEntity(type, Crypto.randomUUID(), input, new Date()));
  await writeLocal(type, record, 'upsert');
  return record;
}

export async function updateEntity<T extends EntityType>(type: T, id: string, patch: Partial<EntityInput<T>>): Promise<EntityMap[T]> {
  const current = await getEntity(type, id);
  if (!current) throw new Error('This item no longer exists');
  const record = validate(type, { ...current, ...patch, updatedAt: new Date().toISOString() });
  await writeLocal(type, record, 'upsert');
  return record;
}

export async function deleteEntity<T extends EntityType>(type: T, id: string): Promise<void> {
  const current = await getEntity(type, id);
  if (!current) return;
  const now = new Date().toISOString();
  await writeLocal(type, { ...current, deletedAt: now, updatedAt: now }, 'delete');
}

/** Restore a just-deleted record (for "Undo"). */
export async function restoreEntity<T extends EntityType>(type: T, record: EntityMap[T]): Promise<void> {
  const restored = { ...record, deletedAt: null, updatedAt: new Date().toISOString() };
  await writeLocal(type, validate(type, restored), 'upsert');
}

// ---- Used by the sync engine ---------------------------------------------------

export interface OutboxRow {
  seq: number;
  type: EntityType;
  id: string;
  op: 'upsert' | 'delete';
  data: string;
  base_version: number;
  attempts: number;
  last_error: string | null;
}

export async function pendingOutbox(limit = 100): Promise<OutboxRow[]> {
  const db = await getDb();
  return db.getAllAsync<OutboxRow>('SELECT * FROM outbox ORDER BY seq ASC LIMIT ?', limit);
}

export async function outboxCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM outbox');
  return row?.n ?? 0;
}

/**
 * Apply a record that came from the server. A record with local changes that
 * are still queued is left alone; the pending push resolves the conflict.
 */
export async function applyServerRecord(type: EntityType, record: Record<string, unknown>, opts: { force?: boolean } = {}): Promise<boolean> {
  const db = await getDb();
  const id = String(record.id);
  if (!opts.force) {
    const pending = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM outbox WHERE type = ? AND id = ?', type, id);
    if ((pending?.n ?? 0) > 0) return false;
  }
  await db.runAsync(
    `INSERT INTO entities (type, id, data, updated_at, deleted, version, dirty) VALUES (?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(type, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted, version = excluded.version, dirty = 0`,
    type,
    id,
    JSON.stringify(record),
    String(record.updatedAt ?? new Date().toISOString()),
    record.deletedAt ? 1 : 0,
    Number(record.version ?? 0),
  );
  return true;
}

/**
 * After the server acknowledged a write while newer local edits are still
 * queued, adopt the server's version so those edits are pushed with the
 * correct base version (and aren't mistaken for conflicts).
 */
export async function adoptServerVersion(type: EntityType, id: string, version: number) {
  const db = await getDb();
  await db.runAsync('UPDATE entities SET version = ? WHERE type = ? AND id = ?', version, type, id);
  await db.runAsync('UPDATE outbox SET base_version = ? WHERE type = ? AND id = ?', version, type, id);
}

export async function removeOutboxRow(seq: number) {
  const db = await getDb();
  await db.runAsync('DELETE FROM outbox WHERE seq = ?', seq);
}

export async function markOutboxFailed(seq: number, error: string) {
  const db = await getDb();
  await db.runAsync('UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE seq = ?', error.slice(0, 300), seq);
}

export async function logSync(type: EntityType, entityId: string, status: string, message: string) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO sync_log (type, entity_id, status, message, created_at) VALUES (?, ?, ?, ?, ?)',
    type,
    entityId,
    status,
    message,
    new Date().toISOString(),
  );
  await db.runAsync('DELETE FROM sync_log WHERE id NOT IN (SELECT id FROM sync_log ORDER BY id DESC LIMIT 200)');
}

export async function recentSyncLog(limit = 50) {
  const db = await getDb();
  return db.getAllAsync<{ id: number; type: string; entity_id: string; status: string; message: string; created_at: string }>(
    'SELECT * FROM sync_log ORDER BY id DESC LIMIT ?',
    limit,
  );
}
