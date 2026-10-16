import type { FastifyInstance } from 'fastify';
import { makeApp, prisma, registerUser } from './helpers';

let app: FastifyInstance;
beforeAll(async () => {
  app = await makeApp();
});
afterAll(async () => {
  await app.close();
});

describe('auth', () => {
  it('registers, logs in and rejects bad credentials with a generic message', async () => {
    const u = await registerUser(app, 'Priya');
    const ok = await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: u.email, password: 'correct-horse-1' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.name).toBe('Priya');

    const bad = await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: u.email, password: 'wrong-password' } });
    const unknown = await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: 'nobody@example.com', password: 'whatever1' } });
    expect(bad.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(bad.json().error.message).toBe(unknown.json().error.message);
  });

  it('stores only password and refresh-token hashes', async () => {
    const u = await registerUser(app);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: u.user.id } });
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    const tokens = await prisma.refreshToken.findMany({ where: { userId: u.user.id } });
    expect(tokens.some((t) => t.tokenHash === u.refreshToken)).toBe(false);
  });

  it('rejects duplicate emails and weak passwords', async () => {
    const u = await registerUser(app);
    const dup = await app.inject({ method: 'POST', url: '/v1/auth/register', payload: { email: u.email, password: 'another-pass-1', name: 'X' } });
    expect(dup.statusCode).toBe(409);
    const weak = await app.inject({ method: 'POST', url: '/v1/auth/register', payload: { email: 'weak@example.com', password: 'short', name: 'X' } });
    expect(weak.statusCode).toBe(400);
    expect(weak.json().error.code).toBe('validation_error');
  });

  it('rotates refresh tokens and revokes everything on reuse', async () => {
    const u = await registerUser(app);
    const first = await app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: u.refreshToken } });
    expect(first.statusCode).toBe(200);
    const rotated = first.json().refreshToken as string;
    expect(rotated).not.toBe(u.refreshToken);

    // Replaying the old token = theft signal: all sessions die, including the rotated one.
    const replay = await app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: u.refreshToken } });
    expect(replay.statusCode).toBe(401);
    const afterReuse = await app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: rotated } });
    expect(afterReuse.statusCode).toBe(401);
  });

  it('requires a valid access token on protected routes', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/auth/me' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { authorization: 'Bearer forged.token.here' } })).statusCode).toBe(401);
  });

  it('lets a guest upgrade to a full account and keep their data', async () => {
    const g = await app.inject({ method: 'POST', url: '/v1/auth/guest', payload: {} });
    expect(g.statusCode).toBe(201);
    const guest = g.json();
    expect(guest.user.isGuest).toBe(true);
    const auth = { authorization: `Bearer ${guest.accessToken}` };
    await app.inject({ method: 'POST', url: '/v1/memories', headers: auth, payload: { content: 'Likes chai' } });

    const claim = await app.inject({
      method: 'POST',
      url: '/v1/auth/claim',
      headers: auth,
      payload: { email: `claimed${Date.now()}@example.com`, password: 'claimed-pass-1', name: 'Ravi' },
    });
    expect(claim.statusCode).toBe(200);
    expect(claim.json().user).toMatchObject({ isGuest: false, name: 'Ravi', id: guest.user.id });
    const memories = await app.inject({ method: 'GET', url: '/v1/memories', headers: { authorization: `Bearer ${claim.json().accessToken}` } });
    expect(memories.json().map((m: { content: string }) => m.content)).toContain('Likes chai');
  });

  it('deletes the account and all its data only with explicit confirmation', async () => {
    const u = await registerUser(app);
    await app.inject({ method: 'POST', url: '/v1/memories', headers: u.auth, payload: { content: 'Secret fact' } });
    const noConfirm = await app.inject({ method: 'DELETE', url: '/v1/account', headers: u.auth, payload: {} });
    expect(noConfirm.statusCode).toBe(400);
    const del = await app.inject({ method: 'DELETE', url: '/v1/account', headers: u.auth, payload: { confirm: 'DELETE MY ACCOUNT' } });
    expect(del.statusCode).toBe(204);
    expect(await prisma.user.findUnique({ where: { id: u.user.id } })).toBeNull();
    expect(await prisma.memory.count({ where: { userId: u.user.id } })).toBe(0);
  });

  it('validates preference updates', async () => {
    const u = await registerUser(app);
    const ok = await app.inject({ method: 'PATCH', url: '/v1/preferences', headers: u.auth, payload: { assistantName: 'Nova', language: 'hinglish' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ assistantName: 'Nova', language: 'hinglish', currency: 'INR' });
    const badTz = await app.inject({ method: 'PATCH', url: '/v1/preferences', headers: u.auth, payload: { timezone: 'Mars/Olympus' } });
    expect(badTz.statusCode).toBe(400);
  });
});
