import type { FastifyInstance } from 'fastify';
import { entity, makeApp, parseSse, prisma, registerUser, reply, ScriptedAi, text, toolUse } from './helpers';

let app: FastifyInstance;
let ai: ScriptedAi;

beforeEach(async () => {
  ai = new ScriptedAi();
  app = await makeApp({ ai });
});
afterEach(async () => {
  await app.close();
});

async function newConversation(auth: Record<string, string>) {
  const res = await app.inject({ method: 'POST', url: '/v1/conversations', headers: auth, payload: {} });
  return res.json().id as string;
}

async function send(auth: Record<string, string>, conversationId: string, message: string, extra: Record<string, unknown> = {}) {
  const res = await app.inject({
    method: 'POST',
    url: `/v1/conversations/${conversationId}/messages`,
    headers: auth,
    payload: { text: message, ...extra },
  });
  expect(res.statusCode).toBe(200);
  const events = parseSse(res.body);
  const done = events.find((e) => e.type === 'done') as { message: { text: string; toolCalls: { name: string; status: string; pendingActionId: string | null }[]; status: string } } | undefined;
  return { events, done: done?.message };
}

describe('agent', () => {
  it('turns "remind me tomorrow at 9" into a verified reminder', async () => {
    const u = await registerUser(app, 'Asha');
    const conv = await newConversation(u.auth);
    const remindAt = new Date(Date.now() + 86_400_000).toISOString();
    ai.script(
      () => reply(text('Setting that up.'), toolUse('create_reminder', { title: 'Call mom', remindAt })),
      (req) => {
        const last = req.messages[req.messages.length - 1]!;
        const result = (last.content as { type: string; content: string }[])[0]!;
        expect(result.type).toBe('tool_result');
        expect(result.content).toContain('Reminder saved');
        return reply(text('Done — I will remind you tomorrow at 9 AM.'));
      },
    );

    const { events, done } = await send(u.auth, conv, 'Remind me tomorrow at 9 AM to call mom');
    expect(events.map((e) => e.type)).toEqual(['user_message', 'text_delta', 'tool_start', 'tool_end', 'text_delta', 'done']);
    expect(done!.toolCalls[0]).toMatchObject({ name: 'create_reminder', status: 'succeeded' });
    const saved = await prisma.reminder.findMany({ where: { userId: u.user.id } });
    expect(saved).toHaveLength(1);
    expect(saved[0]!.title).toBe('Call mom');

    // The context block gives the model the user's local time and timezone.
    const firstUserTurn = ai.turns[0]!.messages[0]!.content as { type: string; text: string }[];
    expect(firstUserTurn[0]!.text).toContain('Current local time:');
    expect(firstUserTurn[0]!.text).toContain('Asia/Kolkata');
    expect(firstUserTurn[firstUserTurn.length - 1]!.text).toBe('Remind me tomorrow at 9 AM to call mom');
  });

  it('never executes a destructive tool without confirmation', async () => {
    const u = await registerUser(app);
    const task = entity('task', { title: 'Old task' });
    await app.inject({ method: 'POST', url: '/v1/sync/push', headers: u.auth, payload: { changes: [{ type: 'task', op: 'upsert', baseVersion: 0, data: task }] } });
    const conv = await newConversation(u.auth);
    ai.script(
      () => reply(toolUse('delete_task', { id: task.id })),
      (req) => {
        const res = (req.messages.at(-1)!.content as { content: string }[])[0]!;
        expect(res.content).toContain('NOT EXECUTED YET');
        return reply(text('Please confirm the deletion in the card.'));
      },
    );
    const { done } = await send(u.auth, conv, 'Delete my old task');
    const call = done!.toolCalls[0]!;
    expect(call.status).toBe('awaiting_confirmation');
    expect(call.pendingActionId).toBeTruthy();
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).deletedAt).toBeNull();

    // Another user cannot confirm it.
    const other = await registerUser(app);
    const steal = await app.inject({ method: 'POST', url: `/v1/actions/${call.pendingActionId}/confirm`, headers: other.auth });
    expect(steal.statusCode).toBe(404);

    const confirm = await app.inject({ method: 'POST', url: `/v1/actions/${call.pendingActionId}/confirm`, headers: u.auth });
    expect(confirm.statusCode).toBe(200);
    expect(confirm.json()).toMatchObject({ status: 'confirmed', result: 'Deleted task “Old task”' });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).deletedAt).not.toBeNull();

    // Double-confirm is refused; nothing runs twice.
    const again = await app.inject({ method: 'POST', url: `/v1/actions/${call.pendingActionId}/confirm`, headers: u.auth });
    expect(again.statusCode).toBe(409);

    // The confirmation is reported to the model on the next turn (append-only).
    ai.script(() => reply(text('Great, it is gone.')));
    await send(u.auth, conv, 'thanks');
    const ctx = (ai.turns.at(-1)!.messages.at(-1)!.content as { text: string }[])[0]!.text;
    expect(ctx).toContain('User confirmed: Deleted task “Old task”');
  });

  it('rejecting a pending action leaves data untouched', async () => {
    const u = await registerUser(app);
    const conv = await newConversation(u.auth);
    ai.script(() => reply(toolUse('save_memory', { content: 'Allergic to peanuts' })), () => reply(text('Confirm to save.')));
    const { done } = await send(u.auth, conv, 'Remember I am allergic to peanuts');
    const id = done!.toolCalls[0]!.pendingActionId!;
    const rej = await app.inject({ method: 'POST', url: `/v1/actions/${id}/reject`, headers: u.auth });
    expect(rej.json().status).toBe('rejected');
    expect(await prisma.memory.count({ where: { userId: u.user.id } })).toBe(0);
  });

  it('replays history append-only with a frozen system prompt and tool set', async () => {
    const u = await registerUser(app);
    const conv = await newConversation(u.auth);
    ai.script(
      () => reply(toolUse('calculate', { expression: '2+2' })),
      () => reply(text('It is 4.')),
      () => reply(text('You are welcome.')),
    );
    await send(u.auth, conv, 'What is 2+2?');
    await send(u.auth, conv, 'Thanks!');

    const [t1, t2, t3] = ai.turns;
    expect(t3!.system).toBe(t1!.system);
    expect(JSON.stringify(t3!.tools)).toBe(JSON.stringify(t1!.tools));
    // Everything sent in turn 2 (plus its response) is an exact prefix of turn 3.
    const prefix = [...t2!.messages];
    expect(t3!.messages.slice(0, prefix.length)).toEqual(prefix);
    expect(t3!.messages[prefix.length]).toMatchObject({ role: 'assistant' });
    expect(t3!.messages).toHaveLength(prefix.length + 2);
  });

  it('reports invalid tool input and unknown tools as errors to the model', async () => {
    const u = await registerUser(app);
    const conv = await newConversation(u.auth);
    ai.script(
      () => reply(toolUse('create_task', { title: '' }), toolUse('run_shell', { cmd: 'rm -rf /' })),
      (req) => {
        const results = req.messages.at(-1)!.content as { is_error?: boolean; content: string }[];
        expect(results).toHaveLength(2);
        expect(results.every((r) => r.is_error)).toBe(true);
        expect(results[1]!.content).toContain('Unknown tool');
        return reply(text('I could not do that.'));
      },
    );
    const { done } = await send(u.auth, conv, 'do stuff');
    expect(done!.toolCalls.map((c) => c.status)).toEqual(['failed', 'failed']);
    expect(await prisma.task.count({ where: { userId: u.user.id } })).toBe(0);
  });

  it('bounds the number of tool iterations', async () => {
    const u = await registerUser(app);
    const conv = await newConversation(u.auth);
    const loop = () => reply(toolUse('calculate', { expression: '1+1' }));
    ai.script(...Array.from({ length: 20 }, () => loop));
    const { done } = await send(u.auth, conv, 'loop forever');
    expect(ai.turns.length).toBe(8);
    expect(done!.text).toContain('stopped after 8 steps');
  });

  it('does not run tools from a refused response', async () => {
    const u = await registerUser(app);
    const conv = await newConversation(u.auth);
    ai.script(() => ({ content: [toolUse('create_task', { title: 'x' })], stopReason: 'refusal' }));
    const { done } = await send(u.auth, conv, 'something disallowed');
    expect(done!.text).toContain("can't help");
    expect(await prisma.task.count({ where: { userId: u.user.id } })).toBe(0);
  });

  it('does not run tool calls truncated by max_tokens', async () => {
    const u = await registerUser(app);
    const conv = await newConversation(u.auth);
    ai.script(() => ({ content: [toolUse('create_task', { title: 'partial' })], stopReason: 'max_tokens' }));
    const { done } = await send(u.auth, conv, 'long request');
    expect(done!.status).toBe('error');
    expect(await prisma.task.count({ where: { userId: u.user.id } })).toBe(0);
  });

  it('surfaces provider errors without claiming success', async () => {
    const u = await registerUser(app);
    const conv = await newConversation(u.auth);
    ai.script(() => {
      throw new Error('boom');
    });
    const { events, done } = await send(u.auth, conv, 'hello');
    expect(events.some((e) => e.type === 'error')).toBe(true);
    expect(done!.status).toBe('error');
  });

  it('is idempotent for retried client message ids', async () => {
    const u = await registerUser(app);
    const conv = await newConversation(u.auth);
    const clientMessageId = '7b0c5f3e-1f0e-4f43-9a7e-6f7a7f1a2b3c';
    ai.script(() => reply(toolUse('create_note', { title: 'Once', content: 'only once' })), () => reply(text('Saved.')));
    await send(u.auth, conv, 'save a note', { clientMessageId });
    const retry = await send(u.auth, conv, 'save a note', { clientMessageId });
    expect(retry.done!.text).toBe('Saved.');
    expect(await prisma.note.count({ where: { userId: u.user.id } })).toBe(1);
  });

  it('keeps conversations private and returns 503 when AI is not configured', async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const conv = await newConversation(a.auth);
    const peek = await app.inject({ method: 'GET', url: `/v1/conversations/${conv}/messages`, headers: b.auth });
    expect(peek.statusCode).toBe(404);

    const noAi = await makeApp();
    const u = await registerUser(noAi);
    const c = await noAi.inject({ method: 'POST', url: '/v1/conversations', headers: u.auth, payload: {} });
    const res = await noAi.inject({ method: 'POST', url: `/v1/conversations/${c.json().id}/messages`, headers: u.auth, payload: { text: 'hi' } });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('ai_unavailable');
    await noAi.close();
  });
});
