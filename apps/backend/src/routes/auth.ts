import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  claimGuestSchema,
  deleteAccountSchema,
  entityTypes,
  guestSchema,
  loginSchema,
  pushTokenSchema,
  refreshSchema,
  registerSchema,
  updatePreferencesSchema,
} from '@aura/shared';
import { parse } from '../lib/errors';
import { AuthService } from '../modules/auth/service';
import { delegateFor, toDto } from '../modules/entities/registry';
import { memoryDto } from '../modules/memory/service';
import { documentDto } from '../modules/documents/service';
import { automationDto } from '../modules/automations/service';

export const authRoutes: FastifyPluginAsync = async (app) => {
  const { prisma, config } = app.c;
  const auth = new AuthService(prisma, (payload) => app.jwt.sign(payload), {
    accessTtlMinutes: config.ACCESS_TOKEN_TTL_MINUTES,
    refreshTtlDays: config.REFRESH_TOKEN_TTL_DAYS,
  });
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };
  const ua = (h: unknown) => (typeof h === 'string' ? h : undefined);

  app.post('/auth/register', strict, async (req, reply) => {
    const res = await auth.register(parse(registerSchema, req.body), ua(req.headers['user-agent']));
    return reply.status(201).send(res);
  });
  app.post('/auth/login', strict, async (req) => auth.login(parse(loginSchema, req.body), ua(req.headers['user-agent'])));
  app.post('/auth/guest', strict, async (req, reply) => {
    parse(guestSchema, req.body ?? {});
    return reply.status(201).send(await auth.guest(ua(req.headers['user-agent'])));
  });
  app.post('/auth/refresh', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) =>
    auth.refresh(parse(refreshSchema, req.body).refreshToken, ua(req.headers['user-agent'])),
  );
  app.post('/auth/logout', async (req, reply) => {
    await auth.logout(parse(refreshSchema, req.body).refreshToken);
    return reply.status(204).send();
  });

  app.register(async (priv) => {
    priv.addHook('preHandler', app.authenticate);

    priv.get('/auth/me', async (req) => auth.me(req.userId));
    priv.patch('/auth/me', async (req) => auth.updateProfile(req.userId, parse(z.object({ name: z.string().trim().min(1).max(80) }), req.body)));
    priv.post('/auth/claim', strict, async (req) => auth.claimGuest(req.userId, parse(claimGuestSchema, req.body), ua(req.headers['user-agent'])));
    priv.post('/auth/logout-all', async (req, reply) => {
      await auth.logoutAll(req.userId);
      return reply.status(204).send();
    });

    priv.get('/preferences', async (req) => app.c.preferences.get(req.userId));
    priv.patch('/preferences', async (req) => app.c.preferences.update(req.userId, parse(updatePreferencesSchema, req.body)));

    priv.put('/account/push-token', async (req, reply) => {
      const { token } = parse(pushTokenSchema, req.body);
      await prisma.user.update({ where: { id: req.userId }, data: { pushToken: token } });
      return reply.status(204).send();
    });
    priv.delete('/account/push-token', async (req, reply) => {
      await prisma.user.update({ where: { id: req.userId }, data: { pushToken: null } });
      return reply.status(204).send();
    });

    /** Full data export (JSON) — everything stored for this user except binary file contents. */
    priv.get('/account/export', async (req, reply) => {
      const userId = req.userId;
      const [user, prefs, memories, documents, automations, conversations] = await Promise.all([
        auth.me(userId),
        app.c.preferences.get(userId),
        prisma.memory.findMany({ where: { userId } }),
        prisma.document.findMany({ where: { userId }, select: { id: true, name: true, mimeType: true, sizeBytes: true, summary: true, status: true, text: true, createdAt: true } }),
        prisma.automation.findMany({ where: { userId } }),
        prisma.conversation.findMany({
          where: { userId },
          include: { messages: { select: { role: true, text: true, createdAt: true, toolCalls: true }, orderBy: { createdAt: 'asc' } } },
        }),
      ]);
      const entities: Record<string, unknown[]> = {};
      for (const type of entityTypes) {
        const rows = await delegateFor(prisma, type).findMany({ where: { userId, deletedAt: null } });
        entities[type] = rows.map((r) => toDto(type, r));
      }
      reply.header('Content-Disposition', `attachment; filename="aura-export-${new Date().toISOString().slice(0, 10)}.json"`);
      return {
        exportedAt: new Date().toISOString(),
        user,
        preferences: prefs,
        entities,
        memories: memories.map(memoryDto),
        documents: documents.map((d) => ({ ...documentDto(d), text: d.text })),
        automations: automations.map(automationDto),
        conversations: conversations.map((c) => ({
          id: c.id,
          title: c.title,
          createdAt: c.createdAt.toISOString(),
          messages: c.messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
        })),
      };
    });

    priv.delete('/account', strict, async (req, reply) => {
      parse(deleteAccountSchema, req.body);
      await auth.deleteAccount(req.userId);
      return reply.status(204).send();
    });
  });
};
