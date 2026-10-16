import {
  localDateKey,
  nextOccurrence,
  type CalendarEvent,
  type EntityInput,
  type Recurrence,
  type Reminder,
  type Task,
} from '@aura/shared';

/**
 * Pure planner logic (no React, no I/O) so it can be unit-tested and works
 * fully offline on local data. All "day" math uses the device's local time.
 */

export const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export const PRIORITY_ORDER: Record<Task['priority'], number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}

export const isOpen = (t: Task) => t.status === 'todo' || t.status === 'in_progress';

/** First occurrence of a (possibly recurring) item inside [from, to], or null. */
export function occurrenceWithin(anchorIso: string, recurrence: Recurrence, from: Date, to: Date, tz = deviceTimeZone()): Date | null {
  const anchor = new Date(anchorIso);
  if (recurrence === 'none') return anchor >= from && anchor <= to ? anchor : null;
  if (anchor > to) return null;
  if (anchor >= from) return anchor;
  const next = nextOccurrence(anchor, recurrence, new Date(from.getTime() - 1), tz);
  return next && next <= to ? next : null;
}

export interface AgendaEvent {
  event: CalendarEvent;
  start: Date;
}
export interface AgendaReminder {
  reminder: Reminder;
  at: Date;
}
export interface DayAgenda {
  key: string;
  events: AgendaEvent[];
  tasksDue: Task[];
  overdue: Task[];
  reminders: AgendaReminder[];
}

/** Everything scheduled on a local calendar day. Overdue tasks are only included for today. */
export function buildDayAgenda(
  day: Date,
  data: { tasks: Task[]; events: CalendarEvent[]; reminders: Reminder[] },
  now = new Date(),
  tz = deviceTimeZone(),
): DayAgenda {
  const from = startOfDay(day);
  const to = endOfDay(day);
  const isToday = localDateKey(day) === localDateKey(now);

  const events: AgendaEvent[] = [];
  for (const e of data.events) {
    if (e.recurrence === 'none') {
      const s = new Date(e.startAt);
      const en = e.endAt ? new Date(e.endAt) : s;
      if (s <= to && en >= from) events.push({ event: e, start: s < from ? from : s });
    } else {
      const occ = occurrenceWithin(e.startAt, e.recurrence, from, to, tz);
      if (occ) events.push({ event: e, start: occ });
    }
  }
  events.sort((a, b) => Number(b.event.allDay) - Number(a.event.allDay) || a.start.getTime() - b.start.getTime());

  const open = data.tasks.filter(isOpen);
  const tasksDue = open
    .filter((t) => t.dueAt && new Date(t.dueAt) >= from && new Date(t.dueAt) <= to)
    .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime());
  const overdue = isToday
    ? open
        .filter((t) => t.dueAt && new Date(t.dueAt) < from)
        .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime())
    : [];

  const reminders: AgendaReminder[] = [];
  for (const r of data.reminders) {
    if (r.done) continue;
    const at = occurrenceWithin(r.remindAt, r.recurrence, from, to, tz);
    if (at) reminders.push({ reminder: r, at });
  }
  reminders.sort((a, b) => a.at.getTime() - b.at.getTime());

  return { key: localDateKey(day), events, tasksDue, overdue, reminders };
}

export type TaskFilter = 'today' | 'upcoming' | 'overdue' | 'all' | 'done';

export function filterTasks(tasks: Task[], filter: TaskFilter, now = new Date()): Task[] {
  const today0 = startOfDay(now);
  const today1 = endOfDay(now);
  const due = (t: Task) => (t.dueAt ? new Date(t.dueAt) : null);
  let out: Task[];
  switch (filter) {
    case 'today':
      out = tasks.filter((t) => isOpen(t) && due(t) && due(t)! <= today1);
      break;
    case 'upcoming':
      out = tasks.filter((t) => isOpen(t) && due(t) && due(t)! > today1);
      break;
    case 'overdue':
      out = tasks.filter((t) => isOpen(t) && due(t) && due(t)! < today0);
      break;
    case 'done':
      return tasks
        .filter((t) => t.status === 'done')
        .sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt));
    default:
      out = tasks.filter(isOpen);
  }
  return out.sort((a, b) => {
    const da = due(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const db = due(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return da - db || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.createdAt.localeCompare(b.createdAt);
  });
}

export interface TaskGroup {
  key: string;
  title: string;
  tasks: Task[];
}

/** Group sorted tasks by local due day ("Overdue" bucket first, "No date" last). */
export function groupTasksByDay(tasks: Task[], labelFor: (d: Date) => string, now = new Date()): TaskGroup[] {
  const today0 = startOfDay(now);
  const groups = new Map<string, TaskGroup>();
  for (const t of tasks) {
    let key: string;
    let title: string;
    if (!t.dueAt) {
      key = 'zz-none';
      title = 'No date';
    } else {
      const d = new Date(t.dueAt);
      if (d < today0 && t.status !== 'done') {
        key = '0-overdue';
        title = 'Overdue';
      } else {
        key = `1-${localDateKey(d)}`;
        title = labelFor(d);
      }
    }
    const g = groups.get(key) ?? { key, title, tasks: [] };
    g.tasks.push(t);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export interface MonthCell {
  date: Date;
  key: string;
  inMonth: boolean;
  isToday: boolean;
}

/** 6-row month grid (42 cells). weekStartsOn: 0 = Sunday, 1 = Monday. */
export function buildMonthGrid(year: number, month: number, weekStartsOn: 0 | 1 = 1, now = new Date()): MonthCell[][] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() - weekStartsOn + 7) % 7;
  const start = new Date(year, month, 1 - offset);
  const todayKey = localDateKey(now);
  const weeks: MonthCell[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: MonthCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
      const key = localDateKey(date);
      row.push({ date, key, inMonth: date.getMonth() === month, isToday: key === todayKey });
    }
    weeks.push(row);
  }
  return weeks;
}

/** Day keys in [from, to] that have at least one event occurrence or open task due. */
export function busyDayKeys(from: Date, to: Date, data: { tasks: Task[]; events: CalendarEvent[] }, tz = deviceTimeZone()): Set<string> {
  const keys = new Set<string>();
  for (const t of data.tasks) {
    if (!isOpen(t) || !t.dueAt) continue;
    const d = new Date(t.dueAt);
    if (d >= from && d <= to) keys.add(localDateKey(d));
  }
  for (const e of data.events) {
    const anchor = new Date(e.startAt);
    if (e.recurrence === 'none') {
      const end = e.endAt ? new Date(e.endAt) : anchor;
      for (let d = startOfDay(anchor < from ? from : anchor); d <= end && d <= to; d = addDays(d, 1)) keys.add(localDateKey(d));
      continue;
    }
    let cursor = new Date(from.getTime() - 1);
    for (let i = 0; i < 62; i++) {
      const occ = anchor > cursor ? anchor : nextOccurrence(anchor, e.recurrence, cursor, tz);
      if (!occ || occ > to) break;
      if (occ >= from) keys.add(localDateKey(occ));
      cursor = occ;
    }
  }
  return keys;
}

/**
 * Recurring tasks: completing one instance creates the next instance with
 * its due date (and reminder, shifted by the same amount) moved to the next
 * occurrence after the current due date. Returns null for one-off tasks or
 * tasks without a due date.
 */
export function nextRecurringTaskInput(task: Task, now = new Date(), tz = deviceTimeZone()): Partial<EntityInput<'task'>> | null {
  if (task.recurrence === 'none' || !task.dueAt) return null;
  const due = new Date(task.dueAt);
  // Skip occurrences already in the past so the next instance is actionable.
  const after = due > now ? due : now;
  const next = nextOccurrence(due, task.recurrence, after, tz);
  if (!next) return null;
  const shift = next.getTime() - due.getTime();
  return {
    title: task.title,
    notes: task.notes,
    priority: task.priority,
    status: 'todo',
    dueAt: next.toISOString(),
    remindAt: task.remindAt ? new Date(new Date(task.remindAt).getTime() + shift).toISOString() : null,
    recurrence: task.recurrence,
    projectId: task.projectId,
    tags: task.tags,
    estimateMinutes: task.estimateMinutes,
    completedAt: null,
  };
}

/** Upcoming occurrences of reminders (not done), soonest first, for a window. */
export function upcomingReminders(reminders: Reminder[], now = new Date(), days = 30, tz = deviceTimeZone()): AgendaReminder[] {
  const to = addDays(now, days);
  const out: AgendaReminder[] = [];
  for (const r of reminders) {
    if (r.done) continue;
    const at = occurrenceWithin(r.remindAt, r.recurrence, now, to, tz);
    if (at) out.push({ reminder: r, at });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Tomorrow at 09:00 local time. */
export function tomorrowAt9(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0, 0);
}
