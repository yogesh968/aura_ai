import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  askDocumentSchema,
  createMemorySchema,
  idParamSchema,
  syncPullQuerySchema,
  syncPushSchema,
  toolDefinitions,
  toolNames,
  updateMemorySchema,
  uploadDocumentSchema,
  MAX_DOCUMENT_BYTES,
} from '@aura/shared';
import { parse } from '../lib/errors';

export const dataRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);
  const c = app.c;

  // ---- Sync ----------------------------------------------------------------
  app.post('/sync/push', { bodyLimit: 5 * 1024 * 1024 }, async (req) => {
    const { changes } = parse(syncPushSchema, req.body);
    return { results: await c.sync.push(req.userId, changes) };
  });
  app.get('/sync/pull', async (req) => {
    const q = parse(syncPullQuerySchema, req.query);
    return c.sync.pull(req.userId, q.since, q.limit);
  });

  // ---- Memory --------------------------------------------------------------
  app.get('/memories', async (req) => c.memory.list(req.userId));
  app.post('/memories', async (req, reply) => {
    const input = parse(createMemorySchema, req.body);
    return reply.status(201).send(await c.memory.create(req.userId, { ...input, source: 'user' }));
  });
  app.patch('/memories/:id', async (req) => {
    const { id } = parse(idParamSchema, req.params);
    return c.memory.update(req.userId, id, parse(updateMemorySchema, req.body));
  });
  app.delete('/memories/:id', async (req, reply) => {
    await c.memory.remove(req.userId, parse(idParamSchema, req.params).id);
    return reply.status(204).send();
  });
  app.delete('/memories', async (req) => ({ deleted: await c.memory.removeAll(req.userId) }));

  // ---- Documents & knowledge base ----------------------------------------------
  app.get('/documents', async (req) => c.documents.list(req.userId));
  app.post('/documents', { bodyLimit: Math.ceil((MAX_DOCUMENT_BYTES * 4) / 3) + 64 * 1024 }, async (req, reply) => {
    const doc = await c.documents.upload(req.userId, parse(uploadDocumentSchema, req.body));
    return reply.status(201).send(doc);
  });
  app.get('/documents/:id', async (req) => c.documents.get(req.userId, parse(idParamSchema, req.params).id));
  app.delete('/documents/:id', async (req, reply) => {
    await c.documents.remove(req.userId, parse(idParamSchema, req.params).id);
    return reply.status(204).send();
  });
  app.post('/documents/:id/summarize', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const prefs = await c.preferences.get(req.userId);
    return c.documents.summarize(req.userId, parse(idParamSchema, req.params).id, prefs);
  });
  app.post('/documents/:id/ask', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const { id } = parse(idParamSchema, req.params);
    const { question } = parse(askDocumentSchema, req.body);
    const prefs = await c.preferences.get(req.userId);
    return { answer: await c.documents.ask(req.userId, id, question, prefs) };
  });
  app.get('/knowledge/search', async (req) => {
    const { q, limit } = parse(z.object({ q: z.string().trim().min(1).max(200), limit: z.coerce.number().int().min(1).max(20).default(10) }), req.query);
    return c.knowledge.search(req.userId, q, limit);
  });

  // ---- Planner & finance -----------------------------------------------------
  app.get('/planner/agenda', async (req) => {
    const { date } = parse(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.query);
    const prefs = await c.preferences.get(req.userId);
    return c.planner.agenda(req.userId, date, prefs.timezone);
  });
  app.get('/planner/reschedule', async (req) => {
    const prefs = await c.preferences.get(req.userId);
    return c.planner.rescheduleSuggestions(req.userId, prefs.timezone);
  });
  app.get('/finance/summary', async (req) => {
    const { month } = parse(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }), req.query);
    const prefs = await c.preferences.get(req.userId);
    return c.finance.summary(req.userId, { month, currency: prefs.currency, timezone: prefs.timezone });
  });
  app.get('/finance/export.csv', async (req, reply) => {
    const csv = await c.finance.exportCsv(req.userId);
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="aura-transactions.csv"');
    return csv;
  });

  // ---- Notifications inbox -----------------------------------------------------
  app.get('/notifications', async (req) => c.notifications.list(req.userId));
  app.post('/notifications/read', async (req) => {
    const body = parse(z.object({ ids: z.union([z.array(z.uuid()).max(200), z.literal('all')]) }), req.body);
    return { updated: await c.notifications.markRead(req.userId, body.ids) };
  });

  // ---- Tool catalog & audit log --------------------------------------------------
  app.get('/tools', async () =>
    toolNames.map((name) => {
      const d = toolDefinitions[name];
      return {
        name,
        label: d.label,
        description: d.description,
        category: d.category,
        permission: d.permission,
        automatable: d.automatable,
        inputSchema: z.toJSONSchema(d.input, { io: 'input' }),
      };
    }),
  );
  app.get('/tool-executions', async (req) => {
    const { limit } = parse(z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }), req.query);
    const rows = await c.prisma.toolExecution.findMany({ where: { userId: req.userId }, orderBy: { createdAt: 'desc' }, take: limit });
    return rows.map((r) => ({
      id: r.id,
      toolName: r.toolName,
      status: r.status,
      summary: r.summary,
      source: r.automationRunId ? 'automation' : 'chat',
      durationMs: r.durationMs,
      createdAt: r.createdAt.toISOString(),
    }));
  });
};
