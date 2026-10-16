import { create } from 'zustand';
import { entityTypes, type EntityType, type SyncChange } from '@aura/shared';
import { endpoints } from '@/lib/api/endpoints';
import { isNetworkError, errorMessage } from '@/lib/api/client';
import { getMeta, setMeta } from '@/lib/db/database';
import {
  adoptServerVersion,
  applyServerRecord,
  logSync,
  markOutboxFailed,
  notifyChanged,
  outboxCount,
  pendingOutbox,
  removeOutboxRow,
} from '@/lib/db/repo';

const MAX_ATTEMPTS = 5;

export interface SyncState {
  status: 'idle' | 'syncing' | 'offline' | 'error';
  lastSyncedAt: string | null;
  pending: number;
  lastError: string | null;
  conflicts: number;
}

export const useSyncStore = create<SyncState>(() => ({
  status: 'idle',
  lastSyncedAt: null,
  pending: 0,
  lastError: null,
  conflicts: 0,
}));

let enabled = false;
let inFlight: Promise<void> | null = null;
let again = false;
let debounce: ReturnType<typeof setTimeout> | null = null;

/** Turn syncing on/off (on only while signed in). */
export function setSyncEnabled(value: boolean) {
  enabled = value;
  if (!value && debounce) clearTimeout(debounce);
}

export async function refreshPendingCount() {
  useSyncStore.setState({ pending: await outboxCount() });
}

/** Debounced sync after local edits. */
export function scheduleSync(delayMs = 1500) {
  void refreshPendingCount();
  if (!enabled) return;
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => void syncNow(), delayMs);
}

/** Push local changes, then pull remote ones. Concurrent calls coalesce. */
export function syncNow(): Promise<void> {
  if (!enabled) return Promise.resolve();
  if (inFlight) {
    again = true;
    return inFlight;
  }
  inFlight = (async () => {
    useSyncStore.setState({ status: 'syncing' });
    try {
      do {
        again = false;
        await push();
        await pull();
      } while (again);
      useSyncStore.setState({ status: 'idle', lastSyncedAt: new Date().toISOString(), lastError: null });
    } catch (e) {
      useSyncStore.setState({
        status: isNetworkError(e) ? 'offline' : 'error',
        lastError: isNetworkError(e) ? null : errorMessage(e, 'Sync failed'),
      });
    } finally {
      inFlight = null;
      await refreshPendingCount();
    }
  })();
  return inFlight;
}

async function push() {
  for (let round = 0; round < 50; round++) {
    const rows = (await pendingOutbox(100)).filter((r) => r.attempts < MAX_ATTEMPTS);
    if (rows.length === 0) return;
    const changes: SyncChange[] = rows.map((r) => ({
      type: r.type,
      op: r.op,
      data: JSON.parse(r.data) as Record<string, unknown>,
      baseVersion: r.base_version,
    }));
    const { results } = await endpoints.sync.push(changes);
    const touched = new Set<EntityType>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const result = results[i];
      if (!result) continue;
      if (result.status === 'rejected') {
        await markOutboxFailed(row.seq, result.error ?? 'Rejected by server');
        if (row.attempts + 1 >= MAX_ATTEMPTS) {
          await logSync(row.type, row.id, 'rejected', `A change could not be saved to the cloud: ${result.error ?? 'rejected'}`);
          useSyncStore.setState((s) => ({ conflicts: s.conflicts + 1 }));
        }
        continue;
      }
      await removeOutboxRow(row.seq);
      if (result.record) {
        const applied = await applyServerRecord(row.type, result.record);
        if (!applied && typeof result.record.version === 'number') {
          await adoptServerVersion(row.type, row.id, result.record.version);
        }
        touched.add(row.type);
      }
      if (result.status === 'conflict_server_won') {
        await logSync(row.type, row.id, 'conflict', 'This item was changed on another device more recently, so that version was kept.');
        useSyncStore.setState((s) => ({ conflicts: s.conflicts + 1 }));
      }
    }
    notifyChanged([...touched]);
    if (rows.length < 100) return;
  }
}

async function pull() {
  let cursor = Number((await getMeta('sync_cursor')) ?? 0);
  for (let page = 0; page < 100; page++) {
    const res = await endpoints.sync.pull(cursor, 500);
    const touched = new Set<EntityType>();
    for (const change of res.changes) {
      if (!entityTypes.includes(change.type)) continue;
      if (await applyServerRecord(change.type, change.record)) touched.add(change.type);
    }
    cursor = res.cursor;
    await setMeta('sync_cursor', String(cursor));
    notifyChanged([...touched]);
    if (!res.hasMore) return;
  }
}

/** Forget the sync cursor so the next sync re-downloads everything. */
export async function resetSyncCursor() {
  await setMeta('sync_cursor', '0');
}
