import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  CalcError,
  convertUnits,
  evaluateExpression,
  translateSchema,
  UnitError,
  writeAssistSchema,
} from '@aura/shared';
import { badRequest, parse } from '../lib/errors';

export const assistantRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);
  const c = app.c;
  const aiLimit = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

  app.get('/briefing/:kind', aiLimit, async (req) => {
    const { kind } = parse(z.object({ kind: z.enum(['morning', 'evening']) }), req.params);
    return c.briefing.generate(req.userId, kind);
  });

  app.get('/weather', async (req) => {
    const q = parse(
      z.object({
        q: z.string().trim().min(1).max(120).optional(),
        lat: z.coerce.number().min(-90).max(90).optional(),
        lon: z.coerce.number().min(-180).max(180).optional(),
        name: z.string().max(120).optional(),
      }),
      req.query,
    );
    if (q.q) return c.weather.forecast(await c.weather.geocode(q.q));
    if (q.lat != null && q.lon != null) return c.weather.forecast({ name: q.name ?? 'Current location', latitude: q.lat, longitude: q.lon });
    const prefs = await c.preferences.get(req.userId);
    if (!prefs.location) throw badRequest('No location saved. Set your city in Settings or pass ?q=');
    return c.weather.forecast(prefs.location);
  });

  app.get('/geocode', async (req) => {
    const { q } = parse(z.object({ q: z.string().trim().min(1).max(120) }), req.query);
    return c.weather.geocode(q);
  });

  app.post('/utils/calculate', async (req) => {
    const { expression } = parse(z.object({ expression: z.string().trim().min(1).max(500) }), req.body);
    try {
      return { expression, result: evaluateExpression(expression) };
    } catch (err) {
      throw badRequest(err instanceof CalcError ? err.message : 'Invalid expression');
    }
  });

  app.post('/utils/convert', async (req) => {
    const b = parse(z.object({ value: z.number(), from: z.string().min(1).max(30), to: z.string().min(1).max(30) }), req.body);
    try {
      return convertUnits(b.value, b.from, b.to);
    } catch (err) {
      throw badRequest(err instanceof UnitError ? err.message : 'Invalid conversion');
    }
  });

  app.post('/web/search', aiLimit, async (req) => {
    const { query } = parse(z.object({ query: z.string().trim().min(2).max(500) }), req.body);
    return c.web.search(query, await c.preferences.get(req.userId));
  });

  app.post('/ai/translate', aiLimit, async (req) => {
    const b = parse(translateSchema, req.body);
    return { translation: await c.web.translate(b.text, b.targetLanguage) };
  });

  app.post('/ai/write', { ...aiLimit, bodyLimit: 256 * 1024 }, async (req) => {
    const b = parse(writeAssistSchema, req.body);
    return { text: await c.web.write(b, await c.preferences.get(req.userId)) };
  });
};
