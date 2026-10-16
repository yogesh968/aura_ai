import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createAutomationSchema, idParamSchema, updateAutomationSchema } from '@aura/shared';
import { parse } from '../lib/errors';
import { automationDto } from '../modules/automations/service';

export const automationRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);
  const a = app.c.automations;

  app.get('/automations', async (req) => a.list(req.userId));
  app.get('/automations/suggestions', async (req) => a.suggestions(req.userId));
  app.get('/automations/runs', async (req) => {
    const q = parse(z.object({ automationId: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }), req.query);
    return a.runs(req.userId, q);
  });
  app.post('/automations', async (req, reply) => reply.status(201).send(await a.create(req.userId, parse(createAutomationSchema, req.body))));
  app.get('/automations/:id', async (req) => automationDto(await a.get(req.userId, parse(idParamSchema, req.params).id)));
  app.patch('/automations/:id', async (req) => {
    const { id } = parse(idParamSchema, req.params);
    return a.update(req.userId, id, parse(updateAutomationSchema, req.body));
  });
  app.delete('/automations/:id', async (req, reply) => {
    await a.remove(req.userId, parse(idParamSchema, req.params).id);
    return reply.status(204).send();
  });
  app.post('/automations/:id/run', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) =>
    a.runNow(req.userId, parse(idParamSchema, req.params).id),
  );
  app.post('/automations/runs/:id/cancel', async (req) => a.cancel(req.userId, parse(idParamSchema, req.params).id));
  app.post('/automations/runs/:id/retry', async (req) => a.retry(req.userId, parse(idParamSchema, req.params).id));
};
