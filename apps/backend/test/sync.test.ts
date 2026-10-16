import type { FastifyInstance } from 'fastify';
import { entity, makeApp, registerUser } from './helpers';

let app: FastifyInstance;
beforeAll(async () => {
  app = await makeApp();
});
afterAll(async () => {
  await app.close();
});

async function push(auth: Record<string, string>, changes: unknown[]) {
  const res = await app.inject({ method: 'POST', url: '/v1/sync/push', headers: auth, payload: { changes } });
  expect(res.statusCode).toBe(200);
  return res.json().results as { status: string; record: Record<string, unknown> | null; error?: string }[];
}
async function pull(auth: Record<string, string>, since = 0) {
  const res = await app.inject({ method: 'GET', url: `/v1/sync/pull?since=${since}`, headers: auth });
  expect(res.statusCode).toBe(200);
  return res.json() as { changes: { type: string; record: Record<string, unknown> }[]; cursor: number; hasMore: boolean };
}

describe('sync', () => {
  it('pushes new records and pulls them back incrementally by cursor', async () => {
    const u = await registerUser(app);
    const task = entity('task', { title: 'Buy milk' });
    const note = entity('note', { title: 'Ideas', content: 'Learn guitar' });
    const [r1, r2] = await push(u.auth, [
      { type: 'task', op: 'upsert', baseVersion: 0, data: task },
      { type: 'note', op: 'upsert', baseVersion: 0, data: note },
    ]);
    expect(r1!.status).toBe('applied');
    expect(r1!.record!.version).toBe(1);
    expect(r2!.status).toBe('applied');

    const all = await pull(u.auth);
    expect(all.changes.map((c) => c.record.id).sort()).toEqual([task.id, note.id].sort());

    const none = await pull(u.auth, all.cursor);
    expect(none.changes).toHaveLength(0);

    await push(u.auth, [{ type: 'task', op: 'upsert', baseVersion: 1, data: { ...task, title: 'Buy oat milk', updatedAt: new Date().toISOString() } }]);
    const delta = await pull(u.auth, all.cursor);
    expect(delta.changes).toHaveLength(1);
    expect(delta.changes[0]!.record).toMatchObject({ title: 'Buy oat milk', version: 2 });
  });

  it('resolves conflicts last-writer-wins on client modification time', async () => {
    const u = await registerUser(app);
    const t0 = new Date('2026-10-15T08:00:00Z');
    const task = entity('task', { title: 'Original' }, t0);
    await push(u.auth, [{ type: 'task', op: 'upsert', baseVersion: 0, data: task }]);
    // Device A edits at 09:00 (version -> 2)
    await push(u.auth, [{ type: 'task', op: 'upsert', baseVersion: 1, data: { ...task, title: 'A edit', updatedAt: '2026-10-15T09:00:00.000Z' } }]);

    // Device B, still on version 1, made an OLDER edit (08:30): server wins.
    const [older] = await push(u.auth, [{ type: 'task', op: 'upsert', baseVersion: 1, data: { ...task, title: 'B old edit', updatedAt: '2026-10-15T08:30:00.000Z' } }]);
    expect(older!.status).toBe('conflict_server_won');
    expect(older!.record!.title).toBe('A edit');

    // Device B made a NEWER edit (10:00): client wins.
    const [newer] = await push(u.auth, [{ type: 'task', op: 'upsert', baseVersion: 1, data: { ...task, title: 'B new edit', updatedAt: '2026-10-15T10:00:00.000Z' } }]);
    expect(newer!.status).toBe('conflict_client_won');
    expect(newer!.record!.title).toBe('B new edit');
  });

  it('propagates deletions as tombstones', async () => {
    const u = await registerUser(app);
    const r = entity('reminder', { title: 'Call mom', remindAt: '2026-12-01T03:30:00.000Z' });
    await push(u.auth, [{ type: 'reminder', op: 'upsert', baseVersion: 0, data: r }]);
    const { cursor } = await pull(u.auth);
    const [del] = await push(u.auth, [{ type: 'reminder', op: 'delete', baseVersion: 1, data: { id: r.id, updatedAt: new Date().toISOString() } }]);
    expect(del!.status).toBe('applied');
    const after = await pull(u.auth, cursor);
    expect(after.changes[0]!.record.deletedAt).not.toBeNull();
  });

  it('isolates users and rejects invalid records', async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const task = entity('task', { title: 'A private task' });
    await push(a.auth, [{ type: 'task', op: 'upsert', baseVersion: 0, data: task }]);

    const [hijack] = await push(b.auth, [{ type: 'task', op: 'upsert', baseVersion: 5, data: { ...task, title: 'pwned', updatedAt: new Date(Date.now() + 1e6).toISOString() } }]);
    expect(hijack!.status).toBe('rejected');
    expect((await pull(b.auth)).changes).toHaveLength(0);
    expect((await pull(a.auth)).changes[0]!.record.title).toBe('A private task');

    const [invalid] = await push(a.auth, [{ type: 'task', op: 'upsert', baseVersion: 0, data: { ...entity('task', { title: 'x' }), priority: 'galactic' } }]);
    expect(invalid!.status).toBe('rejected');
    expect(invalid!.error).toContain('priority');
  });

  it('stores money as exact minor units', async () => {
    const u = await registerUser(app);
    const tx = entity('transaction', { kind: 'expense', amountMinor: 1234567890123, currency: 'INR', category: 'Rent', occurredAt: new Date().toISOString() });
    const [res] = await push(u.auth, [{ type: 'transaction', op: 'upsert', baseVersion: 0, data: tx }]);
    expect(res!.record!.amountMinor).toBe(1234567890123);
  });
});
