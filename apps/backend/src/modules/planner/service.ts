import {
  addDaysToKey,
  dateKeyInTz,
  endOfDayInTz,
  formatIsoInTz,
  nextOccurrence,
  startOfDayInTz,
  zonedParts,
  zonedTimeToUtc,
  type CalendarEvent,
  type Habit,
  type Reminder,
  type RescheduleSuggestion,
  type Task,
} from '@aura/shared';
import type { EntityService } from '../entities/service';

export interface Agenda {
  date: string;
  timezone: string;
  tasksDue: Task[];
  overdueTasks: Task[];
  events: (CalendarEvent & { occurrenceStart: string })[];
  reminders: (Reminder & { occurrenceAt: string })[];
  habits: { habit: Habit; progress: number; target: number }[];
  wellness: Record<string, number>;
}

/** Occurrence of a (possibly recurring) item that falls within [start, end]. */
function occurrenceWithin(anchorIso: string, recurrence: Task['recurrence'], start: Date, end: Date, tz: string) {
  const anchor = new Date(anchorIso);
  if (recurrence === 'none') return anchor >= start && anchor <= end ? anchor : null;
  if (anchor > end) return null;
  const next = anchor >= start ? anchor : nextOccurrence(anchor, recurrence, new Date(start.getTime() - 1), tz);
  return next && next <= end ? next : null;
}

export class PlannerService {
  constructor(private readonly entities: EntityService) {}

  async agenda(userId: string, date: string, tz: string, now = new Date()): Promise<Agenda> {
    const start = startOfDayInTz(date, tz);
    const end = endOfDayInTz(date, tz);

    const [openTasks, events, reminders, habits, habitLogs, wellness] = await Promise.all([
      this.entities.list(userId, 'task', {
        where: { status: { in: ['todo', 'in_progress'] }, dueAt: { not: null, lte: end } },
        orderBy: { dueAt: 'asc' },
        take: 200,
      }),
      this.entities.list(userId, 'event', {
        where: { startAt: { lte: end }, OR: [{ recurrence: { not: 'none' } }, { startAt: { gte: start } }, { endAt: { gte: start } }] },
        orderBy: { startAt: 'asc' },
        take: 300,
      }),
      this.entities.list(userId, 'reminder', {
        where: { done: false, remindAt: { lte: end }, OR: [{ recurrence: { not: 'none' } }, { remindAt: { gte: start } }] },
        orderBy: { remindAt: 'asc' },
        take: 200,
      }),
      this.entities.list(userId, 'habit', { where: { archived: false }, take: 100 }),
      this.entities.list(userId, 'habitLog', { where: { date }, take: 500 }),
      this.entities.list(userId, 'wellness', { where: { date }, take: 500 }),
    ]);

    const tasksDue = openTasks.filter((t) => t.dueAt && new Date(t.dueAt) >= start);
    const overdueTasks = openTasks.filter((t) => t.dueAt && new Date(t.dueAt) < start && new Date(t.dueAt) < now);

    const dayEvents = events
      .map((e) => {
        if (e.recurrence === 'none') {
          const s = new Date(e.startAt);
          const en = e.endAt ? new Date(e.endAt) : s;
          return s <= end && en >= start ? { ...e, occurrenceStart: e.startAt } : null;
        }
        const occ = occurrenceWithin(e.startAt, e.recurrence, start, end, tz);
        return occ ? { ...e, occurrenceStart: occ.toISOString() } : null;
      })
      .filter((e): e is CalendarEvent & { occurrenceStart: string } => e !== null)
      .sort((a, b) => a.occurrenceStart.localeCompare(b.occurrenceStart));

    const dayReminders = reminders
      .map((r) => {
        const occ = occurrenceWithin(r.remindAt, r.recurrence, start, end, tz);
        return occ ? { ...r, occurrenceAt: occ.toISOString() } : null;
      })
      .filter((r): r is Reminder & { occurrenceAt: string } => r !== null);

    const habitProgress = habits.map((habit) => ({
      habit,
      progress: habitLogs.filter((l) => l.habitId === habit.id).reduce((s, l) => s + l.value, 0),
      target: habit.target,
    }));

    const wellnessTotals: Record<string, number> = {};
    for (const w of wellness) {
      // Weight/mood are point-in-time readings; others accumulate over the day.
      wellnessTotals[w.metric] =
        w.metric === 'weight' || w.metric === 'mood' ? w.value : (wellnessTotals[w.metric] ?? 0) + w.value;
    }

    return {
      date,
      timezone: tz,
      tasksDue,
      overdueTasks,
      events: dayEvents,
      reminders: dayReminders,
      habits: habitProgress,
      wellness: wellnessTotals,
    };
  }

  /** Compact, model-friendly rendering of an agenda. */
  formatAgenda(a: Agenda): string {
    const t = (iso: string) => formatIsoInTz(new Date(iso), a.timezone).slice(11, 16);
    const lines: string[] = [`Agenda for ${a.date} (${a.timezone})`];
    lines.push(
      a.events.length
        ? `Events:\n${a.events.map((e) => `- ${e.allDay ? 'all day' : t(e.occurrenceStart)} ${e.title}${e.location ? ` @ ${e.location}` : ''} [id ${e.id}]`).join('\n')}`
        : 'Events: none',
    );
    lines.push(
      a.tasksDue.length
        ? `Tasks due:\n${a.tasksDue.map((x) => `- ${t(x.dueAt!)} ${x.title} (${x.priority}) [id ${x.id}]`).join('\n')}`
        : 'Tasks due: none',
    );
    if (a.overdueTasks.length) {
      lines.push(`Overdue:\n${a.overdueTasks.map((x) => `- ${x.title} (was due ${x.dueAt}) [id ${x.id}]`).join('\n')}`);
    }
    lines.push(
      a.reminders.length
        ? `Reminders:\n${a.reminders.map((r) => `- ${t(r.occurrenceAt)} ${r.title} [id ${r.id}]`).join('\n')}`
        : 'Reminders: none',
    );
    if (a.habits.length) {
      lines.push(`Habits:\n${a.habits.map((h) => `- ${h.habit.name}: ${h.progress}/${h.target}${h.habit.unit ? ` ${h.habit.unit}` : ''}`).join('\n')}`);
    }
    const w = Object.entries(a.wellness);
    if (w.length) lines.push(`Wellness logged: ${w.map(([k, v]) => `${k} ${v}`).join(', ')}`);
    return lines.join('\n');
  }

  /**
   * Suggest new slots for overdue tasks: the next free half-hour-aligned slots
   * between 09:00 and 21:00 local time, avoiding today's and tomorrow's events.
   */
  async rescheduleSuggestions(userId: string, tz: string, now = new Date()): Promise<RescheduleSuggestion[]> {
    const overdue = await this.entities.list(userId, 'task', {
      where: { status: { in: ['todo', 'in_progress'] }, dueAt: { not: null, lt: now } },
      orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }],
      take: 20,
    });
    if (overdue.length === 0) return [];

    const today = dateKeyInTz(now, tz);
    const days = [today, addDaysToKey(today, 1), addDaysToKey(today, 2)];
    const busy: [number, number][] = [];
    for (const day of days) {
      const agenda = await this.agenda(userId, day, tz, now);
      for (const e of agenda.events) {
        const s = new Date(e.occurrenceStart).getTime();
        const dur = e.endAt ? new Date(e.endAt).getTime() - new Date(e.startAt).getTime() : 60 * 60_000;
        busy.push([s, s + (e.allDay ? 0 : dur)]);
      }
      for (const task of agenda.tasksDue) {
        const s = new Date(task.dueAt!).getTime();
        busy.push([s - (task.estimateMinutes ?? 30) * 60_000, s]);
      }
    }

    const order = { urgent: 0, high: 1, medium: 2, low: 3 } as const;
    overdue.sort((a, b) => order[a.priority] - order[b.priority]);

    const suggestions: RescheduleSuggestion[] = [];
    // Start at the next half hour, at least 15 minutes from now.
    let cursor = Math.ceil((now.getTime() + 15 * 60_000) / (30 * 60_000)) * 30 * 60_000;
    const horizon = now.getTime() + 3 * 86_400_000;

    for (const task of overdue) {
      const duration = (task.estimateMinutes ?? 30) * 60_000;
      while (cursor < horizon) {
        const p = zonedParts(new Date(cursor), tz);
        const dayKey = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
        const dayStart = zonedTimeToUtc({ year: p.year, month: p.month, day: p.day, hour: 9 }, tz).getTime();
        const dayEnd = zonedTimeToUtc({ year: p.year, month: p.month, day: p.day, hour: 21 }, tz).getTime();
        if (cursor < dayStart) {
          cursor = dayStart;
          continue;
        }
        if (cursor + duration > dayEnd) {
          cursor = zonedTimeToUtc({ ...parseKey(addDaysToKey(dayKey, 1)), hour: 9 }, tz).getTime();
          continue;
        }
        const clash = busy.find(([s, e]) => cursor < e && cursor + duration > s);
        if (clash) {
          cursor = Math.ceil(clash[1] / (30 * 60_000)) * 30 * 60_000;
          continue;
        }
        break;
      }
      if (cursor >= horizon) break;
      const slotStart = cursor;
      busy.push([slotStart, slotStart + duration]);
      cursor = slotStart + duration;
      const dueAt = new Date(slotStart + duration);
      suggestions.push({
        taskId: task.id,
        title: task.title,
        originalDueAt: task.dueAt!,
        suggestedDueAt: dueAt.toISOString(),
        reason: `Free ${Math.round(duration / 60_000)}-minute slot starting ${formatIsoInTz(new Date(slotStart), tz).slice(0, 16).replace('T', ' ')}`,
      });
    }
    return suggestions;
  }
}

function parseKey(key: string) {
  const [year, month, day] = key.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}
