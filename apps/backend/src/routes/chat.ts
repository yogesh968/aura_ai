import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { idParamSchema, sendMessageSchema, type ChatStreamEvent } from '@aura/shared';
import { parse, AppError } from '../lib/errors';

export const chatRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);
  const c = app.c;

  app.get('/conversations', async (req) => {
    const q = parse(z.object({ limit: z.coerce.number().int().min(1).max(100).default(30), before: z.iso.datetime({ offset: true }).optional() }), req.query);
    return c.agent.listConversations(req.userId, q.limit, q.before);
  });
  app.post('/conversations', async (req, reply) => {
    const { title } = parse(z.object({ title: z.string().max(80).optional() }), req.body ?? {});
    return reply.status(201).send(await c.agent.createConversation(req.userId, title));
  });
  app.patch('/conversations/:id', async (req) => {
    const { id } = parse(idParamSchema, req.params);
    const { title } = parse(z.object({ title: z.string().trim().min(1).max(80) }), req.body);
    return c.agent.renameConversation(req.userId, id, title);
  });
  app.delete('/conversations/:id', async (req, reply) => {
    await c.agent.deleteConversation(req.userId, parse(idParamSchema, req.params).id);
    return reply.status(204).send();
  });
  app.get('/conversations/:id/messages', async (req) => {
    const { id } = parse(idParamSchema, req.params);
    const { limit } = parse(z.object({ limit: z.coerce.number().int().min(1).max(200).default(100) }), req.query);
    return c.agent.messages(req.userId, id, limit);
  });

  /**
   * Send a message and stream the agent's work as Server-Sent Events
   * (text deltas, tool start/end, sources, final message). Closing the
   * connection cancels the turn.
   */
  app.post(
    '/conversations/:id/messages',
    { bodyLimit: 64 * 1024, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { id } = parse(idParamSchema, req.params);
      const input = parse(sendMessageSchema, req.body);
      await c.agent.getConversation(req.userId, id);
      if (!c.ai.available) {
        throw new AppError(503, 'ai_unavailable', 'AI chat is not configured on this server. Your tasks, notes and other offline features still work.');
      }

      const controller = new AbortController();
      req.raw.on('close', () => {
        if (!reply.raw.writableEnded) controller.abort();
      });

      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      const send = (e: ChatStreamEvent) => {
        if (!reply.raw.writableEnded) reply.raw.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
      };
      const keepAlive = setInterval(() => !reply.raw.writableEnded && reply.raw.write(': ping\n\n'), 15_000);
      try {
        await c.agent.sendMessage(req.userId, id, input, send, controller.signal);
      } catch (err) {
        req.log.error({ err }, 'chat turn failed');
        send({
          type: 'error',
          code: err instanceof AppError ? err.code : 'internal_error',
          message: err instanceof AppError ? err.message : 'Something went wrong. Please try again.',
        });
      } finally {
        clearInterval(keepAlive);
        reply.raw.end();
      }
    },
  );

  // ---- Confirmation-gated actions ----------------------------------------------
  app.get('/actions', async (req) => {
    const { status } = parse(z.object({ status: z.enum(['pending', 'all']).default('pending') }), req.query);
    return c.actions.list(req.userId, status);
  });
  app.post('/actions/:id/confirm', async (req) => c.actions.confirm(req.userId, parse(idParamSchema, req.params).id));
  app.post('/actions/:id/reject', async (req) => c.actions.reject(req.userId, parse(idParamSchema, req.params).id));
};
