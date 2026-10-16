import type { PrismaClient } from '@prisma/client';
import {
  addDaysToKey,
  dateKeyInTz,
  formatIsoInTz,
  formatMoney,
  startOfDayInTz,
  zonedParts,
  type Briefing,
  type Weather,
} from '@aura/shared';
import type { AiProvider } from '../ai/provider';
import type { EntityService } from '../entities/service';
import type { PlannerService } from '../planner/service';
import type { WeatherService } from '../weather/service';
import { resolvePreferences } from '../preferences/service';
import { languageInstruction } from '../agent/prompts';

/**
 * Morning briefings and evening summaries. The structured sections are always
 * computed from the user's real data; the AI narrative is optional and is
 * omitted (aiAvailable=false) when no AI provider is configured.
 */
export class BriefingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly entities: EntityService,
    private readonly planner: PlannerService,
    private readonly weather: WeatherService,
    private readonly ai: AiProvider,
  ) {}

  async generate(userId: string, kind: 'morning' | 'evening', now = new Date()): Promise<Briefing> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, preferences: true } });
    const prefs = resolvePreferences(user.preferences);
    const tz = prefs.timezone;
    const today = dateKeyInTz(now, tz);
    const hm = (iso: string) => formatIsoInTz(new Date(iso), tz).slice(11, 16);
    const firstName = user.name.split(' ')[0] ?? user.name;

    let weather: Weather | null = null;
    if (prefs.location && this.weather.available) {
      weather = await this.weather.forecast(prefs.location).catch(() => null);
    }

    const sections: Briefing['sections'] = [];
    if (kind === 'morning') {
      const a = await this.planner.agenda(userId, today, tz, now);
      sections.push({
        title: 'Schedule',
        items: a.events.map((e) => `${e.allDay ? 'All day' : hm(e.occurrenceStart)} · ${e.title}${e.location ? ` (${e.location})` : ''}`),
      });
      const tasks = [...a.tasksDue].sort((x, y) => priorityRank(x.priority) - priorityRank(y.priority));
      sections.push({ title: 'Tasks due today', items: tasks.map((t) => `${t.title}${t.priority === 'urgent' || t.priority === 'high' ? ` (${t.priority})` : ''}`) });
      if (a.overdueTasks.length) sections.push({ title: 'Carried over', items: a.overdueTasks.map((t) => t.title) });
      sections.push({ title: 'Reminders', items: a.reminders.map((r) => `${hm(r.occurrenceAt)} · ${r.title}`) });
      const bills = await this.entities.list(userId, 'recurringPayment', {
        where: { active: true, nextDueAt: { lte: new Date(now.getTime() + 3 * 86_400_000) } },
        orderBy: { nextDueAt: 'asc' },
        take: 10,
      });
      if (bills.length) {
        sections.push({ title: 'Bills due soon', items: bills.map((b) => `${b.name} · ${formatMoney(b.amountMinor, b.currency)} · ${formatIsoInTz(new Date(b.nextDueAt), tz).slice(0, 10)}`) });
      }
      if (a.habits.length) sections.push({ title: 'Habits', items: a.habits.map((h) => `${h.habit.name} · goal ${h.target}${h.habit.unit ? ` ${h.habit.unit}` : ''}`) });
    } else {
      const dayStart = startOfDayInTz(today, tz);
      const [done, a, tomorrow, spent] = await Promise.all([
        this.entities.list(userId, 'task', { where: { status: 'done', completedAt: { gte: dayStart } }, take: 50 }),
        this.planner.agenda(userId, today, tz, now),
        this.planner.agenda(userId, addDaysToKey(today, 1), tz, now),
        this.entities.list(userId, 'transaction', { where: { kind: 'expense', occurredAt: { gte: dayStart }, currency: prefs.currency }, take: 200 }),
      ]);
      sections.push({ title: 'Completed today', items: done.map((t) => t.title) });
      sections.push({ title: 'Still open', items: [...a.tasksDue, ...a.overdueTasks].map((t) => t.title) });
      const w = a.wellness;
      const t = prefs.wellnessTargets;
      sections.push({
        title: 'Wellness',
        items: [
          `Water ${w.water ?? 0} / ${t.waterMl} ml`,
          `Exercise ${w.exercise ?? 0} / ${t.exerciseMinutes} min`,
          ...(w.sleep != null ? [`Sleep ${w.sleep} h`] : []),
          ...a.habits.map((h) => `${h.habit.name} ${h.progress}/${h.target}`),
        ],
      });
      if (spent.length) {
        sections.push({ title: 'Spending today', items: [formatMoney(spent.reduce((s, x) => s + x.amountMinor, 0), prefs.currency)] });
      }
      sections.push({
        title: 'Tomorrow',
        items: [
          ...tomorrow.events.map((e) => `${e.allDay ? 'All day' : hm(e.occurrenceStart)} · ${e.title}`),
          ...tomorrow.tasksDue.map((x) => `Task · ${x.title}`),
        ],
      });
    }

    const hour = zonedParts(now, tz).hour;
    const greeting =
      kind === 'evening' ? `Good evening, ${firstName}` : hour < 12 ? `Good morning, ${firstName}` : `Here's your day, ${firstName}`;

    let aiSummary: string | null = null;
    if (this.ai.available) {
      const facts = [
        ...sections.map((s) => `${s.title}:\n${s.items.length ? s.items.map((i) => `- ${i}`).join('\n') : '- (none)'}`),
        weather ? `Weather: ${weather.current.condition}, ${Math.round(weather.current.temperatureC)}°C; today ${Math.round(weather.daily[0]?.minC ?? 0)}–${Math.round(weather.daily[0]?.maxC ?? 0)}°C` : 'Weather: unavailable',
      ].join('\n\n');
      try {
        const res = await this.ai.complete({
          system:
            `You write ${kind} briefings for ${user.name}'s personal assistant, ${prefs.assistantName}. ` +
            `Use ONLY the facts provided; never invent events, numbers or weather. 3-5 short sentences, warm and practical, ` +
            `${kind === 'morning' ? 'highlight priorities and one tip for the day' : 'celebrate progress and suggest what to prepare for tomorrow'}. ` +
            `No markdown headings. ${languageInstruction(prefs.language)}`,
          messages: [{ role: 'user', content: `Date: ${today}\n\n${facts}` }],
          maxTokens: 2000,
        });
        aiSummary = res.text.trim() || null;
      } catch {
        aiSummary = null;
      }
    }

    return {
      kind,
      date: today,
      greeting,
      aiSummary,
      aiAvailable: this.ai.available,
      sections,
      weather,
      generatedAt: now.toISOString(),
    };
  }
}

function priorityRank(p: string) {
  return ({ urgent: 0, high: 1, medium: 2, low: 3 } as Record<string, number>)[p] ?? 4;
}
