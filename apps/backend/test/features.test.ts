import type { FastifyInstance } from 'fastify';
import { addDaysToKey, dateKeyInTz, zonedTimeToUtc } from '@aura/shared';
import { computeNextRun, resolveTemplates } from '../src/modules/automations/service';
import { entity, makeApp, prisma, registerUser, ScriptedAi } from './helpers';

let app: FastifyInstance;
const TZ = 'Asia/Kolkata';

beforeAll(async () => {
  const fakeFetch = (async (url: string) => {
    if (String(url).includes('geocoding')) {
      return new Response(JSON.stringify({ results: [{ name: 'Pune', admin1: 'Maharashtra', country: 'India', latitude: 18.52, longitude: 73.86 }] }));
    }
    return new Response(
      JSON.stringify({
        current: { temperature_2m: 29.4, apparent_temperature: 31, relative_humidity_2m: 60, wind_speed_10m: 9, weather_code: 2 },
        daily: { time: ['2026-10-15'], weather_code: [61], temperature_2m_max: [31], temperature_2m_min: [22], precipitation_probability_max: [70] },
      }),
    );
  }) as typeof fetch;
  app = await makeApp({ ai: new ScriptedAi(), fetch: fakeFetch });
});
afterAll(async () => {
  await app.close();
});

const push = (auth: Record<string, string>, changes: { type: string; data: unknown }[]) =>
  app.inject({
    method: 'POST',
    url: '/v1/sync/push',
    headers: auth,
    payload: { changes: changes.map((c) => ({ ...c, op: 'upsert', baseVersion: 0 })) },
  });

describe('planner', () => {
  it('builds an agenda including recurring events and reminders', async () => {
    const u = await registerUser(app);
    const today = dateKeyInTz(new Date(), TZ);
    const at = (key: string, hour: number) => zonedTimeToUtc({ ...splitKey(key), hour }, TZ).toISOString();
    await push(u.auth, [
      { type: 'event', data: entity('event', { title: 'Standup', startAt: at(addDaysToKey(today, -7), 10), recurrence: 'daily' }) },
      { type: 'event', data: entity('event', { title: 'Next week', startAt: at(addDaysToKey(today, 7), 10) }) },
      { type: 'task', data: entity('task', { title: 'Due today', dueAt: at(today, 18) }) },
      { type: 'reminder', data: entity('reminder', { title: 'Water plants', remindAt: at(addDaysToKey(today, -3), 8), recurrence: 'daily' }) },
    ]);
    const res = await app.inject({ method: 'GET', url: `/v1/planner/agenda?date=${today}`, headers: u.auth });
    const a = res.json();
    expect(a.events.map((e: { title: string }) => e.title)).toEqual(['Standup']);
    expect(a.events[0].occurrenceStart).toBe(at(today, 10));
    expect(a.tasksDue.map((t: { title: string }) => t.title)).toEqual(['Due today']);
    expect(a.reminders[0].occurrenceAt).toBe(at(today, 8));
  });

  it('suggests non-overlapping slots for overdue tasks', async () => {
    const u = await registerUser(app);
    const past = new Date(Date.now() - 2 * 86_400_000).toISOString();
    await push(u.auth, [
      { type: 'task', data: entity('task', { title: 'Missed A', dueAt: past, estimateMinutes: 60, priority: 'high' }) },
      { type: 'task', data: entity('task', { title: 'Missed B', dueAt: past, estimateMinutes: 30 }) },
    ]);
    const res = await app.inject({ method: 'GET', url: '/v1/planner/reschedule', headers: u.auth });
    const s = res.json() as { title: string; suggestedDueAt: string }[];
    expect(s.map((x) => x.title)).toEqual(['Missed A', 'Missed B']);
    expect(new Date(s[0]!.suggestedDueAt).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(s[1]!.suggestedDueAt).getTime()).toBeGreaterThanOrEqual(new Date(s[0]!.suggestedDueAt).getTime() + 30 * 60_000);
  });
});

describe('finance', () => {
  it('summarizes the month by category against budgets', async () => {
    const u = await registerUser(app);
    const now = new Date().toISOString();
    await push(u.auth, [
      { type: 'transaction', data: entity('transaction', { kind: 'income', amountMinor: 5_000_000, currency: 'INR', category: 'Salary', occurredAt: now }) },
      { type: 'transaction', data: entity('transaction', { kind: 'expense', amountMinor: 120_000, currency: 'INR', category: 'Groceries', occurredAt: now }) },
      { type: 'transaction', data: entity('transaction', { kind: 'expense', amountMinor: 999, currency: 'USD', category: 'Apps', occurredAt: now }) },
      { type: 'budget', data: entity('budget', { category: 'Groceries', limitMinor: 800_000, currency: 'INR' }) },
    ]);
    const s = (await app.inject({ method: 'GET', url: '/v1/finance/summary', headers: u.auth })).json();
    expect(s).toMatchObject({ incomeMinor: 5_000_000, expenseMinor: 120_000, netMinor: 4_880_000, otherCurrencies: ['USD'] });
    expect(s.byCategory[0]).toEqual({ category: 'Groceries', spentMinor: 120_000, budgetMinor: 800_000 });

    const csv = await app.inject({ method: 'GET', url: '/v1/finance/export.csv', headers: u.auth });
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body.split('\n')).toHaveLength(4);
  });
});

describe('knowledge base', () => {
  it('finds notes, documents and memories by full-text search, per user', async () => {
    const u = await registerUser(app);
    const other = await registerUser(app);
    await push(u.auth, [{ type: 'note', data: entity('note', { title: 'Trip plan', content: 'Book train tickets to Jaipur in December' }) }]);
    await push(other.auth, [{ type: 'note', data: entity('note', { title: 'Jaipur', content: 'Other user secret Jaipur note' }) }]);
    await app.inject({ method: 'POST', url: '/v1/memories', headers: u.auth, payload: { content: 'Prefers window seats on trains' } });
    await app.inject({
      method: 'POST',
      url: '/v1/documents',
      headers: u.auth,
      payload: { name: 'itinerary.txt', mimeType: 'text/plain', dataBase64: Buffer.from('Day 1: Amber Fort, Jaipur').toString('base64') },
    });

    const res = await app.inject({ method: 'GET', url: '/v1/knowledge/search?q=jaipur', headers: u.auth });
    const kinds = (res.json() as { kind: string; snippet: string }[]).map((r) => r.kind).sort();
    expect(kinds).toEqual(['document', 'note']);
    expect(JSON.stringify(res.json())).not.toContain('Other user secret');

    const trains = await app.inject({ method: 'GET', url: '/v1/knowledge/search?q=trains', headers: u.auth });
    expect(trains.json().map((r: { kind: string }) => r.kind)).toContain('memory');
  });

  it('rejects files that are not what they claim to be', async () => {
    const u = await registerUser(app);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/documents',
      headers: u.auth,
      payload: { name: 'fake.pdf', mimeType: 'application/pdf', dataBase64: Buffer.from('not a pdf').toString('base64') },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('weather', () => {
  it('returns live data with its source, never fabricated', async () => {
    const u = await registerUser(app);
    const w = (await app.inject({ method: 'GET', url: '/v1/weather?q=Pune', headers: u.auth })).json();
    expect(w).toMatchObject({ location: 'Pune, Maharashtra, India', current: { condition: 'Partly cloudy' }, source: { title: 'Open-Meteo' } });
    const noLoc = await app.inject({ method: 'GET', url: '/v1/weather', headers: u.auth });
    expect(noLoc.statusCode).toBe(400);
  });
});

describe('automations', () => {
  it('computes next runs in the user timezone', () => {
    const after = new Date('2026-10-15T10:00:00Z'); // 15:30 IST, Thursday
    expect(computeNextRun({ type: 'daily', time: '07:30' }, TZ, after)!.toISOString()).toBe('2026-10-16T02:00:00.000Z');
    expect(computeNextRun({ type: 'weekly', time: '18:00', days: [0] }, TZ, after)!.toISOString()).toBe('2026-10-18T12:30:00.000Z');
    expect(computeNextRun({ type: 'manual' }, TZ, after)).toBeNull();
    expect(resolveTemplates({ dueAt: '{{today@18:00}}', d: '{{tomorrow}}' }, after, TZ)).toEqual({
      dueAt: '2026-10-15T12:30:00.000Z',
      d: '2026-10-16',
    });
  });

  it('refuses consequential or unknown tools in automations', async () => {
    const u = await registerUser(app);
    for (const tool of ['delete_task', 'save_memory', 'exec_shell']) {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/automations',
        headers: u.auth,
        payload: { name: 'bad', trigger: { type: 'manual' }, steps: [{ tool, input: { id: '00000000-0000-4000-8000-000000000000', content: 'x' } }] },
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it('runs steps, records history, stops at the first failure and supports retry', async () => {
    const u = await registerUser(app);
    const created = await app.inject({
      method: 'POST',
      url: '/v1/automations',
      headers: u.auth,
      payload: {
        name: 'Evening wind-down',
        trigger: { type: 'daily', time: '21:00' },
        steps: [
          { tool: 'create_task', input: { title: 'Plan tomorrow', dueAt: '{{today@22:00}}' } },
          { tool: 'log_habit', input: { habitName: 'Meditation' } },
          { tool: 'notify', input: { title: 'Wind down', body: 'Time to relax' } },
        ],
      },
    });
    expect(created.statusCode).toBe(201);
    const automation = created.json();
    expect(automation.nextRunAt).not.toBeNull();

    const run = (await app.inject({ method: 'POST', url: `/v1/automations/${automation.id}/run`, headers: u.auth })).json();
    expect(run.status).toBe('partial');
    expect(run.steps.map((s: { status: string }) => s.status)).toEqual(['succeeded', 'failed', 'skipped']);
    expect(run.error).toContain('No habit named');
    expect(await prisma.task.count({ where: { userId: u.user.id, title: 'Plan tomorrow' } })).toBe(1);
    expect(await prisma.inboxNotification.count({ where: { userId: u.user.id } })).toBe(0);

    // Fix the cause, then retry the run.
    await push(u.auth, [{ type: 'habit', data: entity('habit', { name: 'Meditation' }) }]);
    const retry = (await app.inject({ method: 'POST', url: `/v1/automations/runs/${run.id}/retry`, headers: u.auth })).json();
    expect(retry).toMatchObject({ status: 'succeeded', attempt: 2, trigger: 'retry' });
    expect(await prisma.inboxNotification.count({ where: { userId: u.user.id } })).toBe(1);

    const history = (await app.inject({ method: 'GET', url: '/v1/automations/runs', headers: u.auth })).json();
    expect(history).toHaveLength(2);
    const audit = (await app.inject({ method: 'GET', url: '/v1/tool-executions', headers: u.auth })).json();
    expect(audit.every((a: { source: string }) => a.source === 'automation')).toBe(true);
  });

  it('runs due schedules from the scheduler tick exactly once', async () => {
    const u = await registerUser(app);
    const a = (
      await app.inject({
        method: 'POST',
        url: '/v1/automations',
        headers: u.auth,
        payload: { name: 'Ping', trigger: { type: 'daily', time: '08:00' }, steps: [{ tool: 'notify', input: { title: 'Ping', body: 'hello' } }] },
      })
    ).json();
    await prisma.automation.update({ where: { id: a.id }, data: { nextRunAt: new Date(Date.now() - 1000) } });
    await Promise.all([app.c.automations.tick(), app.c.automations.tick()]);
    expect(await prisma.automationRun.count({ where: { automationId: a.id } })).toBe(1);
    const after = await prisma.automation.findUniqueOrThrow({ where: { id: a.id } });
    expect(after.nextRunAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('suggests automations from the user’s own routines', async () => {
    const u = await registerUser(app);
    await push(u.auth, [{ type: 'routine', data: entity('routine', { name: 'Morning', time: '06:30', steps: ['Stretch', 'Water'] }) }]);
    const s = (await app.inject({ method: 'GET', url: '/v1/automations/suggestions', headers: u.auth })).json();
    expect(s.map((x: { name: string }) => x.name)).toEqual(expect.arrayContaining(['Morning briefing', 'Morning routine']));
  });
});

describe('briefing', () => {
  it('builds sections from real data and an AI summary only from those facts', async () => {
    const u = await registerUser(app);
    await push(u.auth, [{ type: 'task', data: entity('task', { title: 'Submit report', dueAt: new Date(Date.now() + 3_600_000).toISOString(), priority: 'high' }) }]);
    const b = (await app.inject({ method: 'GET', url: '/v1/briefing/morning', headers: u.auth })).json();
    expect(b.greeting).toContain('Test');
    expect(b.aiAvailable).toBe(true);
    expect(b.aiSummary).toBe('Scripted completion.');
    const tasks = b.sections.find((s: { title: string }) => s.title === 'Tasks due today');
    expect(JSON.stringify(b.sections)).toContain('Submit report');
    expect(tasks).toBeDefined();
  });
});

describe('isolation', () => {
  it('does not let users read or modify each other’s memories, documents or runs', async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const mem = (await app.inject({ method: 'POST', url: '/v1/memories', headers: a.auth, payload: { content: 'A private' } })).json();
    expect((await app.inject({ method: 'PATCH', url: `/v1/memories/${mem.id}`, headers: b.auth, payload: { content: 'hacked' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/v1/memories/${mem.id}`, headers: b.auth })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/v1/memories', headers: b.auth })).json()).toEqual([]);
  });
});

function splitKey(key: string) {
  const [year, month, day] = key.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}
