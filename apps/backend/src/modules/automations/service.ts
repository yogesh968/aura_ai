import type { Automation as AutomationRow, AutomationRun as RunRow, PrismaClient } from '@prisma/client';
import {
  addDaysToKey,
  dateKeyInTz,
  isToolName,
  parseDateKey,
  parseTimeOfDay,
  toolDefinitions,
  toolLabel,
  zonedParts,
  zonedTimeToUtc,
  type Automation,
  type AutomationRun,
  type AutomationStep,
  type AutomationSuggestion,
  type AutomationTrigger,
  type Preferences,
} from '@aura/shared';
import { AppError, badRequest, notFound } from '../../lib/errors';
import type { ToolExecutor } from '../agent/tools';
import type { EntityService } from '../entities/service';
import type { PreferencesService } from '../preferences/service';

type RunStep = AutomationRun['steps'][number];

const MAX_AUTOMATIONS_PER_USER = 50;
const RETRY_BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000];

export function automationDto(a: AutomationRow): Automation {
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    trigger: a.trigger as AutomationTrigger,
    steps: a.steps as AutomationStep[],
    enabled: a.enabled,
    maxRetries: a.maxRetries,
    nextRunAt: a.nextRunAt?.toISOString() ?? null,
    lastRunAt: a.lastRunAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
  };
}

export function runDto(r: RunRow & { automation?: { name: string } | null }): AutomationRun {
  return {
    id: r.id,
    automationId: r.automationId,
    automationName: r.automation?.name ?? '',
    status: r.status as AutomationRun['status'],
    trigger: r.trigger as AutomationRun['trigger'],
    attempt: r.attempt,
    steps: r.steps as RunStep[],
    error: r.error,
    startedAt: r.startedAt?.toISOString() ?? null,
    finishedAt: r.finishedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Next time a trigger fires strictly after `after`, in the user's timezone. */
export function computeNextRun(trigger: AutomationTrigger, tz: string, after: Date): Date | null {
  if (trigger.type === 'manual') return null;
  const { hour, minute } = parseTimeOfDay(trigger.time);
  let key = dateKeyInTz(after, tz);
  for (let i = 0; i < 9; i++) {
    const candidate = zonedTimeToUtc({ ...parseDateKey(key), hour, minute }, tz);
    const weekday = zonedParts(candidate, tz).weekday;
    if (candidate > after && (trigger.type === 'daily' || trigger.days.includes(weekday))) return candidate;
    key = addDaysToKey(key, 1);
  }
  return null;
}

/**
 * Resolve template tokens in step inputs at run time so scheduled steps can
 * refer to "today": {{today}}, {{tomorrow}}, {{now}}, {{today@18:00}},
 * {{tomorrow@09:30}}.
 */
export function resolveTemplates(value: unknown, now: Date, tz: string): unknown {
  if (typeof value === 'string') {
    const today = dateKeyInTz(now, tz);
    const tomorrow = addDaysToKey(today, 1);
    return value.replace(/\{\{\s*(today|tomorrow|now)(?:@(\d{2}):(\d{2}))?\s*\}\}/g, (_m, base: string, hh?: string, mm?: string) => {
      if (base === 'now') return now.toISOString();
      const key = base === 'today' ? today : tomorrow;
      if (!hh) return key;
      return zonedTimeToUtc({ ...parseDateKey(key), hour: Number(hh), minute: Number(mm) }, tz).toISOString();
    });
  }
  if (Array.isArray(value)) return value.map((v) => resolveTemplates(v, now, tz));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveTemplates(v, now, tz)]));
  }
  return value;
}

export class AutomationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly executor: ToolExecutor,
    private readonly preferences: PreferencesService,
    private readonly entities: EntityService,
  ) {}

  /** Reject steps that use unknown/non-automatable tools or invalid inputs. */
  validateSteps(steps: AutomationStep[], prefs: Preferences, now = new Date()) {
    steps.forEach((step, i) => {
      if (!isToolName(step.tool)) throw badRequest(`Step ${i + 1}: unknown action "${step.tool}"`);
      const def = toolDefinitions[step.tool];
      if (!def.automatable) throw badRequest(`Step ${i + 1}: “${def.label}” can't be automated`);
      const parsed = def.input.safeParse(resolveTemplates(step.input, now, prefs.timezone));
      if (!parsed.success) {
        throw badRequest(`Step ${i + 1} (${def.label}): ${parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ')}`);
      }
    });
  }

  async list(userId: string) {
    const rows = await this.prisma.automation.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    return rows.map(automationDto);
  }

  async get(userId: string, id: string) {
    const a = await this.prisma.automation.findFirst({ where: { id, userId } });
    if (!a) throw notFound('Automation');
    return a;
  }

  async create(
    userId: string,
    input: { name: string; description?: string; trigger: AutomationTrigger; steps: AutomationStep[]; enabled: boolean; maxRetries: number },
    now = new Date(),
  ) {
    const count = await this.prisma.automation.count({ where: { userId } });
    if (count >= MAX_AUTOMATIONS_PER_USER) throw badRequest(`You can have up to ${MAX_AUTOMATIONS_PER_USER} automations`);
    const prefs = await this.preferences.get(userId);
    this.validateSteps(input.steps, prefs, now);
    const a = await this.prisma.automation.create({
      data: {
        userId,
        name: input.name,
        description: input.description ?? null,
        trigger: input.trigger,
        steps: input.steps.map((s) => ({ ...s, label: s.label ?? toolLabel(s.tool) })) as object[],
        enabled: input.enabled,
        maxRetries: input.maxRetries,
        nextRunAt: input.enabled ? computeNextRun(input.trigger, prefs.timezone, now) : null,
      },
    });
    return automationDto(a);
  }

  async update(userId: string, id: string, patch: Partial<{ name: string; description: string; trigger: AutomationTrigger; steps: AutomationStep[]; enabled: boolean; maxRetries: number }>, now = new Date()) {
    const current = await this.get(userId, id);
    const prefs = await this.preferences.get(userId);
    if (patch.steps) this.validateSteps(patch.steps, prefs, now);
    const trigger = (patch.trigger ?? current.trigger) as AutomationTrigger;
    const enabled = patch.enabled ?? current.enabled;
    const a = await this.prisma.automation.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.trigger ? { trigger: patch.trigger } : {}),
        ...(patch.steps ? { steps: patch.steps.map((s) => ({ ...s, label: s.label ?? toolLabel(s.tool) })) as object[] } : {}),
        ...(patch.maxRetries !== undefined ? { maxRetries: patch.maxRetries } : {}),
        enabled,
        nextRunAt: enabled ? computeNextRun(trigger, prefs.timezone, now) : null,
      },
    });
    return automationDto(a);
  }

  async remove(userId: string, id: string) {
    const { count } = await this.prisma.automation.deleteMany({ where: { id, userId } });
    if (count === 0) throw notFound('Automation');
  }

  async runs(userId: string, opts: { automationId?: string; limit?: number } = {}) {
    const rows = await this.prisma.automationRun.findMany({
      where: { userId, ...(opts.automationId ? { automationId: opts.automationId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(opts.limit ?? 50, 200),
      include: { automation: { select: { name: true } } },
    });
    return rows.map(runDto);
  }

  /** Start a run immediately (manual "Run now"). */
  async runNow(userId: string, id: string) {
    const a = await this.get(userId, id);
    const run = await this.prisma.automationRun.create({
      data: { automationId: a.id, userId, trigger: 'manual', status: 'queued', steps: initialSteps(a) as object[] },
    });
    return this.execute(run.id);
  }

  async retry(userId: string, runId: string) {
    const prev = await this.prisma.automationRun.findFirst({ where: { id: runId, userId }, include: { automation: true } });
    if (!prev) throw notFound('Run');
    if (!['failed', 'partial', 'cancelled'].includes(prev.status)) throw new AppError(409, 'not_retryable', 'Only failed or cancelled runs can be retried');
    const run = await this.prisma.automationRun.create({
      data: { automationId: prev.automationId, userId, trigger: 'retry', attempt: prev.attempt + 1, status: 'queued', steps: initialSteps(prev.automation) as object[] },
    });
    return this.execute(run.id);
  }

  async cancel(userId: string, runId: string) {
    const run = await this.prisma.automationRun.findFirst({ where: { id: runId, userId } });
    if (!run) throw notFound('Run');
    if (run.status === 'queued') {
      const r = await this.prisma.automationRun.update({
        where: { id: runId },
        data: { status: 'cancelled', finishedAt: new Date(), error: 'Cancelled by user' },
        include: { automation: { select: { name: true } } },
      });
      return runDto(r);
    }
    if (run.status === 'running') {
      const r = await this.prisma.automationRun.update({
        where: { id: runId },
        data: { cancelRequested: true },
        include: { automation: { select: { name: true } } },
      });
      return runDto(r);
    }
    throw new AppError(409, 'not_cancellable', `Run already ${run.status}`);
  }

  /**
   * Execute a queued run: steps run in order; the run stops at the first
   * failure (remaining steps are skipped) and is retried with backoff up to
   * maxRetries for scheduled runs. Cancellation is checked between steps.
   */
  async execute(runId: string): Promise<AutomationRun> {
    const claimed = await this.prisma.automationRun.updateMany({
      where: { id: runId, status: 'queued' },
      data: { status: 'running', startedAt: new Date() },
    });
    const run = await this.prisma.automationRun.findUniqueOrThrow({ where: { id: runId }, include: { automation: true } });
    if (claimed.count === 0) return runDto(run);

    const automation = run.automation;
    const prefs = await this.preferences.get(run.userId);
    const steps = (automation.steps as AutomationStep[]).map((s) => ({ tool: s.tool, label: s.label ?? toolLabel(s.tool), status: 'pending', output: null })) as RunStep[];
    let succeeded = 0;
    let failure: string | null = null;
    let cancelled = false;

    for (let i = 0; i < steps.length; i++) {
      const fresh = await this.prisma.automationRun.findUniqueOrThrow({ where: { id: runId }, select: { cancelRequested: true } });
      if (fresh.cancelRequested) {
        cancelled = true;
        for (let j = i; j < steps.length; j++) steps[j]!.status = 'skipped';
        break;
      }
      const now = new Date();
      const def = (automation.steps as AutomationStep[])[i]!;
      const outcome = await this.executor.run(def.tool, resolveTemplates(def.input, now, prefs.timezone), {
        userId: run.userId,
        prefs,
        now,
        source: 'automation',
        automationRunId: runId,
      });
      const ok = outcome.status === 'succeeded';
      steps[i] = { ...steps[i]!, status: ok ? 'succeeded' : 'failed', output: outcome.summary.slice(0, 500) };
      await this.prisma.automationRun.update({ where: { id: runId }, data: { steps: steps as object[] } });
      if (!ok) {
        failure = `Step ${i + 1} (${steps[i]!.label}) failed: ${outcome.summary}`;
        for (let j = i + 1; j < steps.length; j++) steps[j]!.status = 'skipped';
        break;
      }
      succeeded++;
    }

    const status = cancelled ? 'cancelled' : failure ? (succeeded > 0 ? 'partial' : 'failed') : 'succeeded';
    const finished = await this.prisma.automationRun.update({
      where: { id: runId },
      data: { status, steps: steps as object[], error: cancelled ? 'Cancelled by user' : failure, finishedAt: new Date() },
      include: { automation: { select: { name: true } } },
    });
    await this.prisma.automation.update({ where: { id: automation.id }, data: { lastRunAt: new Date() } });

    if (failure && !cancelled && run.trigger !== 'manual' && run.attempt <= automation.maxRetries) {
      const delay = RETRY_BACKOFF_MS[Math.min(run.attempt - 1, RETRY_BACKOFF_MS.length - 1)]!;
      await this.prisma.automationRun.create({
        data: {
          automationId: automation.id,
          userId: run.userId,
          trigger: 'retry',
          attempt: run.attempt + 1,
          status: 'queued',
          steps: initialSteps(automation) as object[],
          notBefore: new Date(Date.now() + delay),
        },
      });
    }
    return runDto(finished);
  }

  /** Scheduler tick: start due automations and due retries; recover interrupted runs. */
  async tick(now = new Date()): Promise<number> {
    let started = 0;
    await this.prisma.automationRun.updateMany({
      where: { status: 'running', startedAt: { lt: new Date(now.getTime() - 15 * 60_000) } },
      data: { status: 'failed', error: 'Interrupted (server restarted)', finishedAt: now },
    });

    const due = await this.prisma.automation.findMany({ where: { enabled: true, nextRunAt: { lte: now } }, take: 50 });
    for (const a of due) {
      const prefs = await this.preferences.get(a.userId);
      const next = computeNextRun(a.trigger as AutomationTrigger, prefs.timezone, now);
      // Optimistic claim: only one scheduler instance advances nextRunAt.
      const claim = await this.prisma.automation.updateMany({ where: { id: a.id, nextRunAt: a.nextRunAt }, data: { nextRunAt: next } });
      if (claim.count === 0) continue;
      const run = await this.prisma.automationRun.create({
        data: { automationId: a.id, userId: a.userId, trigger: 'schedule', status: 'queued', steps: initialSteps(a) as object[] },
      });
      await this.execute(run.id);
      started++;
    }

    const retries = await this.prisma.automationRun.findMany({
      where: { status: 'queued', notBefore: { lte: now } },
      take: 50,
      select: { id: true },
    });
    for (const r of retries) {
      await this.execute(r.id);
      started++;
    }
    return started;
  }

  /** Suggestions derived from the user's own routines, habits and bills. Nothing is created until accepted. */
  async suggestions(userId: string): Promise<AutomationSuggestion[]> {
    const prefs = await this.preferences.get(userId);
    const [existing, routines, habits, bills] = await Promise.all([
      this.prisma.automation.findMany({ where: { userId }, select: { steps: true, name: true } }),
      this.entities.list(userId, 'routine', { where: { active: true }, take: 20 }),
      this.entities.list(userId, 'habit', { where: { archived: false }, take: 20 }),
      this.entities.list(userId, 'recurringPayment', { where: { active: true }, take: 20 }),
    ]);
    const usesTool = (tool: string, match?: (input: Record<string, unknown>) => boolean) =>
      existing.some((a) => (a.steps as AutomationStep[]).some((s) => s.tool === tool && (!match || match(s.input))));
    const names = new Set(existing.map((a) => a.name.toLowerCase()));
    const out: AutomationSuggestion[] = [];

    if (!usesTool('generate_briefing', (i) => i.kind === 'morning')) {
      out.push({
        name: 'Morning briefing',
        reason: `Get your agenda, weather and priorities every day at ${prefs.briefings.morningTime}.`,
        automation: {
          name: 'Morning briefing',
          trigger: { type: 'daily', time: prefs.briefings.morningTime },
          steps: [{ tool: 'generate_briefing', input: { kind: 'morning' } }],
          enabled: true,
          maxRetries: 1,
        },
      });
    }
    if (!usesTool('generate_briefing', (i) => i.kind === 'evening')) {
      out.push({
        name: 'Evening summary',
        reason: `Review what you finished and preview tomorrow at ${prefs.briefings.eveningTime}.`,
        automation: {
          name: 'Evening summary',
          trigger: { type: 'daily', time: prefs.briefings.eveningTime },
          steps: [{ tool: 'generate_briefing', input: { kind: 'evening' } }],
          enabled: true,
          maxRetries: 1,
        },
      });
    }
    for (const r of routines) {
      if (!r.time || names.has(`${r.name} routine`.toLowerCase()) || r.days.length === 0) continue;
      out.push({
        name: `${r.name} routine`,
        reason: `You have a ${r.timeOfDay} routine at ${r.time}; get a checklist nudge when it starts.`,
        automation: {
          name: `${r.name} routine`,
          trigger: r.days.length === 7 ? { type: 'daily', time: r.time } : { type: 'weekly', time: r.time, days: r.days },
          steps: [{ tool: 'notify', input: { title: `${r.name} time`, body: r.steps.slice(0, 5).join(' · ') || 'Time for your routine' } }],
          enabled: true,
          maxRetries: 0,
        },
      });
    }
    if (habits.length && !names.has('habit check-in')) {
      out.push({
        name: 'Habit check-in',
        reason: `A gentle nudge to log ${habits.slice(0, 3).map((h) => h.name).join(', ')} before the day ends.`,
        automation: {
          name: 'Habit check-in',
          trigger: { type: 'daily', time: '20:00' },
          steps: [{ tool: 'notify', input: { title: 'Habit check-in', body: `Did you do ${habits.slice(0, 3).map((h) => h.name).join(', ')} today?` } }],
          enabled: true,
          maxRetries: 0,
        },
      });
    }
    if (bills.length && !usesTool('get_finance_summary')) {
      out.push({
        name: 'Weekly money check',
        reason: `You track ${bills.length} bill${bills.length === 1 ? '' : 's'}; review spending and upcoming bills every Sunday.`,
        automation: {
          name: 'Weekly money check',
          trigger: { type: 'weekly', time: '18:00', days: [0] },
          steps: [
            { tool: 'get_finance_summary', input: {} },
            { tool: 'notify', input: { title: 'Weekly money check', body: 'Your spending summary and upcoming bills are ready in Finance.' } },
          ],
          enabled: true,
          maxRetries: 1,
        },
      });
    }
    return out;
  }
}

function initialSteps(a: AutomationRow): RunStep[] {
  return (a.steps as AutomationStep[]).map((s) => ({ tool: s.tool, label: s.label ?? toolLabel(s.tool), status: 'pending', output: null }));
}
