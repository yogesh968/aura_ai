import * as SQLite from 'expo-sqlite';

/**
 * Local SQLite database: the device's source of truth for offline features.
 *
 * - `entities`: every syncable record (tasks, notes, habits, ...) as JSON,
 *   keyed by (type, id). `dirty` marks local changes not yet acknowledged by
 *   the server.
 * - `outbox`: queued mutations waiting to be pushed.
 * - `meta`: sync cursor, owning user id, etc.
 * - `sync_log`: conflicts/rejections surfaced to the user.
 * - `drafts`: unsent text (chat input, editors) so nothing typed is lost.
 * - `cache`: last good copies of online-only data for offline display.
 */
const SCHEMA_VERSION = 1;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= (async () => {
    const db = await SQLite.openDatabaseAsync('aura.db');
    await migrate(db);
    return db;
  })();
  return dbPromise;
}

async function migrate(db: SQLite.SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version >= SCHEMA_VERSION) return;

  if (version === 0) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS entities (
        type TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 0,
        dirty INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (type, id)
      );
      CREATE INDEX IF NOT EXISTS entities_by_type ON entities (type, deleted);
      CREATE TABLE IF NOT EXISTS outbox (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        id TEXT NOT NULL,
        op TEXT NOT NULL,
        data TEXT NOT NULL,
        base_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      );
      CREATE INDEX IF NOT EXISTS outbox_by_entity ON outbox (type, id);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS drafts (key TEXT PRIMARY KEY NOT NULL, text TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    `);
    version = 1;
  }
  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string) {
  const db = await getDb();
  await db.runAsync('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}

/** Remove all local user data (sign-out / account switch / account deletion). */
export async function wipeLocalData() {
  const db = await getDb();
  await db.execAsync('DELETE FROM entities; DELETE FROM outbox; DELETE FROM meta; DELETE FROM sync_log; DELETE FROM drafts; DELETE FROM cache;');
}

// ---- Drafts (never lose typed text) ----------------------------------------

export async function saveDraft(key: string, text: string) {
  const db = await getDb();
  if (!text.trim()) {
    await db.runAsync('DELETE FROM drafts WHERE key = ?', key);
    return;
  }
  await db.runAsync(
    'INSERT INTO drafts (key, text, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at',
    key,
    text,
    new Date().toISOString(),
  );
}

export async function loadDraft(key: string): Promise<string> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ text: string }>('SELECT text FROM drafts WHERE key = ?', key);
  return row?.text ?? '';
}

// ---- Offline cache for online-only data --------------------------------------

export async function cacheSet(key: string, value: unknown) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO cache (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    key,
    JSON.stringify(value),
    new Date().toISOString(),
  );
}

export async function cacheGet<T>(key: string): Promise<{ value: T; updatedAt: string } | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string; updated_at: string }>('SELECT value, updated_at FROM cache WHERE key = ?', key);
  return row ? { value: JSON.parse(row.value) as T, updatedAt: row.updated_at } : null;
}
