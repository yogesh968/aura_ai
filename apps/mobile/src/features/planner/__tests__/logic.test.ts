import { buildEntity, localDateKey, type EntityInput } from '@aura/shared';
import {
  buildDayAgenda,
  buildMonthGrid,
  busyDayKeys,
  filterTasks,
  groupTasksByDay,
  nextRecurringTaskInput,
  occurrenceWithin,
  upcomingReminders,
} from '../logic';

let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const task = (i: Partial<EntityInput<'task'>>) => buildEntity('task', id(), { title: 'T', ...i });
const event = (i: Partial<EntityInput<'event'>>) => buildEntity('event', id(), { title: 'E', startAt: new Date().toISOString(), ...i });
const reminder = (i: Partial<EntityInput<'reminder'>>) => buildEntity('reminder', id(), { title: 'R', remindAt: new Date().toISOString(), ...i });

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const NOW = at(2026, 10, 15, 10, 0); // Thursday

describe('occurrenceWithin', () => {
  it('handles one-off and recurring anchors', () => {
    const from = at(2026, 10, 15);
    const to = at(2026, 10, 15, 23, 59);
    expect(occurrenceWithin(at(2026, 10, 15, 9).toISOString(), 'none', from, to, TZ)).toEqual(at(2026, 10, 15, 9));
    expect(occurrenceWithin(at(2026, 10, 14, 9).toISOString(), 'none', from, to, TZ)).toBeNull();
    expect(occurrenceWithin(at(2026, 10, 1, 9).toISOString(), 'daily', from, to, TZ)).toEqual(at(2026, 10, 15, 9));
    expect(occurrenceWithin(at(2026, 10, 1, 9).toISOString(), 'weekly', from, to, TZ)).toEqual(at(2026, 10, 15, 9)); // Oct 1 is also a Thursday
    expect(occurrenceWithin(at(2026, 10, 2, 9).toISOString(), 'weekly', from, to, TZ)).toBeNull();
  });
});

describe('buildDayAgenda', () => {
  it('collects events, reminders, due and overdue tasks for today', () => {
    const data = {
      events: [
        event({ title: 'Standup', startAt: at(2026, 10, 1, 10).toISOString(), recurrence: 'weekdays' }),
        event({ title: 'Trip', startAt: at(2026, 10, 14, 8).toISOString(), endAt: at(2026, 10, 16, 20).toISOString() }),
        event({ title: 'Next week', startAt: at(2026, 10, 22, 8).toISOString() }),
      ],
      reminders: [
        reminder({ title: 'Vitamins', remindAt: at(2026, 9, 1, 9).toISOString(), recurrence: 'daily' }),
        reminder({ title: 'Done one', remindAt: at(2026, 10, 15, 12).toISOString(), done: true }),
      ],
      tasks: [
        task({ title: 'Due today', dueAt: at(2026, 10, 15, 18).toISOString() }),
        task({ title: 'Late', dueAt: at(2026, 10, 12, 18).toISOString(), priority: 'urgent' }),
        task({ title: 'Finished', dueAt: at(2026, 10, 15, 9).toISOString(), status: 'done' }),
      ],
    };
    const a = buildDayAgenda(NOW, data, NOW, TZ);
    expect(a.events.map((e) => e.event.title).sort()).toEqual(['Standup', 'Trip']);
    expect(a.reminders.map((r) => r.reminder.title)).toEqual(['Vitamins']);
    expect(a.reminders[0]!.at).toEqual(at(2026, 10, 15, 9));
    expect(a.tasksDue.map((t) => t.title)).toEqual(['Due today']);
    expect(a.overdue.map((t) => t.title)).toEqual(['Late']);

    // Overdue only shows on today's agenda
    expect(buildDayAgenda(at(2026, 10, 16), data, NOW, TZ).overdue).toHaveLength(0);
  });
});

describe('task filters and grouping', () => {
  const tasks = [
    task({ title: 'today', dueAt: at(2026, 10, 15, 17).toISOString() }),
    task({ title: 'overdue', dueAt: at(2026, 10, 13, 17).toISOString() }),
    task({ title: 'tomorrow', dueAt: at(2026, 10, 16, 9).toISOString() }),
    task({ title: 'someday' }),
    task({ title: 'done', status: 'done', completedAt: at(2026, 10, 15, 8).toISOString() }),
  ];
  it('filters by bucket', () => {
    expect(filterTasks(tasks, 'today', NOW).map((t) => t.title)).toEqual(['overdue', 'today']);
    expect(filterTasks(tasks, 'upcoming', NOW).map((t) => t.title)).toEqual(['tomorrow']);
    expect(filterTasks(tasks, 'overdue', NOW).map((t) => t.title)).toEqual(['overdue']);
    expect(filterTasks(tasks, 'all', NOW).map((t) => t.title)).toEqual(['overdue', 'today', 'tomorrow', 'someday']);
    expect(filterTasks(tasks, 'done', NOW).map((t) => t.title)).toEqual(['done']);
  });
  it('groups overdue first and undated last', () => {
    const groups = groupTasksByDay(filterTasks(tasks, 'all', NOW), (d) => localDateKey(d), NOW);
    expect(groups.map((g) => g.title)).toEqual(['Overdue', '2026-10-15', '2026-10-16', 'No date']);
  });
});

describe('buildMonthGrid', () => {
  it('builds 6 Monday-first weeks covering the month', () => {
    const weeks = buildMonthGrid(2026, 9, 1, NOW); // October 2026 (month index 9)
    expect(weeks).toHaveLength(6);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0]![0]!.key).toBe('2026-09-28'); // Oct 1 2026 is a Thursday
    expect(weeks[0]![3]!.key).toBe('2026-10-01');
    expect(weeks[0]![0]!.inMonth).toBe(false);
    expect(weeks.flat().filter((c) => c.isToday).map((c) => c.key)).toEqual(['2026-10-15']);
    expect(weeks.flat().filter((c) => c.inMonth)).toHaveLength(31);
  });
});

describe('busyDayKeys', () => {
  it('marks days with open tasks and expanded recurring events', () => {
    const keys = busyDayKeys(
      at(2026, 10, 1),
      at(2026, 10, 31, 23, 59),
      {
        tasks: [task({ dueAt: at(2026, 10, 20, 9).toISOString() }), task({ dueAt: at(2026, 10, 21, 9).toISOString(), status: 'done' })],
        events: [event({ startAt: at(2026, 9, 5, 10).toISOString(), recurrence: 'weekly' })], // Sep 5 2026 is a Saturday
      },
      TZ,
    );
    expect(keys.has('2026-10-20')).toBe(true);
    expect(keys.has('2026-10-21')).toBe(false);
    expect(['2026-10-03', '2026-10-10', '2026-10-17', '2026-10-24', '2026-10-31'].every((k) => keys.has(k))).toBe(true);
    expect(keys.has('2026-10-04')).toBe(false);
  });
});

describe('nextRecurringTaskInput', () => {
  it('creates the next instance with shifted reminder', () => {
    const t = task({
      title: 'Water plants',
      dueAt: at(2026, 10, 15, 18).toISOString(),
      remindAt: at(2026, 10, 15, 17).toISOString(),
      recurrence: 'weekly',
      tags: ['home'],
    });
    const next = nextRecurringTaskInput(t, NOW, TZ)!;
    expect(next.dueAt).toBe(at(2026, 10, 22, 18).toISOString());
    expect(next.remindAt).toBe(at(2026, 10, 22, 17).toISOString());
    expect(next).toMatchObject({ title: 'Water plants', status: 'todo', recurrence: 'weekly', tags: ['home'], completedAt: null });
  });
  it('skips past occurrences for long-overdue daily tasks', () => {
    const t = task({ dueAt: at(2026, 10, 1, 8).toISOString(), recurrence: 'daily' });
    expect(nextRecurringTaskInput(t, NOW, TZ)!.dueAt).toBe(at(2026, 10, 16, 8).toISOString());
  });
  it('returns null for one-off or undated tasks', () => {
    expect(nextRecurringTaskInput(task({ dueAt: NOW.toISOString() }), NOW, TZ)).toBeNull();
    expect(nextRecurringTaskInput(task({ recurrence: 'daily' }), NOW, TZ)).toBeNull();
  });
});

describe('upcomingReminders', () => {
  it('lists the next occurrence of each pending reminder', () => {
    const list = upcomingReminders(
      [
        reminder({ title: 'later', remindAt: at(2026, 10, 20, 9).toISOString() }),
        reminder({ title: 'daily', remindAt: at(2026, 10, 1, 8).toISOString(), recurrence: 'daily' }),
        reminder({ title: 'past', remindAt: at(2026, 10, 10, 9).toISOString() }),
      ],
      NOW,
      30,
      TZ,
    );
    expect(list.map((r) => r.reminder.title)).toEqual(['daily', 'later']);
    expect(list[0]!.at).toEqual(at(2026, 10, 16, 8));
  });
});
