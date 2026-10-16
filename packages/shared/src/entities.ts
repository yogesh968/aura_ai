import { z } from 'zod';

/**
 * Syncable entities. These are the records that live both in the device's
 * SQLite store (offline-first) and in PostgreSQL. Every entity shares the
 * same envelope (id, timestamps, tombstone, version) so one generic sync
 * engine can handle all of them.
 */

export const isoDateTime = z.iso.datetime({ offset: true });
export const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
export const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm');
export const currencyCode = z.string().regex(/^[A-Z]{3}$/, 'Expected ISO 4217 code');

export const recurrenceSchema = z.enum(['none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly']);
export type Recurrence = z.infer<typeof recurrenceSchema>;

export const baseEntitySchema = z.object({
  id: z.uuid(),
  createdAt: isoDateTime,
  /** Client-side modification time; used for last-writer-wins conflict resolution. */
  updatedAt: isoDateTime,
  deletedAt: isoDateTime.nullable(),
  /** Server-assigned version, incremented on every accepted write. 0 = never synced. */
  version: z.number().int().nonnegative(),
});

const short = z.string().trim().min(1).max(200);
const long = z.string().max(100_000);

export const taskSchema = baseEntitySchema.extend({
  title: short,
  notes: z.string().max(10_000).nullable(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  status: z.enum(['todo', 'in_progress', 'done', 'cancelled']),
  dueAt: isoDateTime.nullable(),
  remindAt: isoDateTime.nullable(),
  recurrence: recurrenceSchema,
  projectId: z.uuid().nullable(),
  tags: z.array(z.string().max(40)).max(20),
  completedAt: isoDateTime.nullable(),
  estimateMinutes: z.number().int().positive().max(24 * 60).nullable(),
});

export const eventSchema = baseEntitySchema.extend({
  title: short,
  startAt: isoDateTime,
  endAt: isoDateTime.nullable(),
  allDay: z.boolean(),
  location: z.string().max(300).nullable(),
  notes: z.string().max(10_000).nullable(),
  kind: z.enum(['event', 'appointment', 'birthday']),
  recurrence: recurrenceSchema,
  reminderMinutesBefore: z.number().int().min(0).max(60 * 24 * 14).nullable(),
});

export const reminderSchema = baseEntitySchema.extend({
  title: short,
  remindAt: isoDateTime,
  recurrence: recurrenceSchema,
  done: z.boolean(),
  notes: z.string().max(2_000).nullable(),
});

export const noteSchema = baseEntitySchema.extend({
  title: z.string().trim().max(200),
  content: long,
  tags: z.array(z.string().max(40)).max(20),
  pinned: z.boolean(),
  kind: z.enum(['note', 'journal']),
  mood: z.number().int().min(1).max(5).nullable(),
});

export const projectSchema = baseEntitySchema.extend({
  name: short,
  description: z.string().max(5_000).nullable(),
  color: z.string().max(20).nullable(),
  deadline: isoDateTime.nullable(),
  status: z.enum(['active', 'completed', 'archived']),
});

export const habitSchema = baseEntitySchema.extend({
  name: short,
  icon: z.string().max(40).nullable(),
  color: z.string().max(20).nullable(),
  frequency: z.enum(['daily', 'weekly']),
  target: z.number().positive().max(100_000),
  unit: z.string().max(30).nullable(),
  archived: z.boolean(),
});

export const habitLogSchema = baseEntitySchema.extend({
  habitId: z.uuid(),
  date: dateKey,
  value: z.number().min(0).max(1_000_000),
});

export const wellnessMetricSchema = z.enum(['water', 'sleep', 'exercise', 'weight', 'mood', 'steps']);
export type WellnessMetric = z.infer<typeof wellnessMetricSchema>;

export const wellnessSchema = baseEntitySchema.extend({
  metric: wellnessMetricSchema,
  value: z.number().min(0).max(1_000_000),
  unit: z.string().max(20),
  date: dateKey,
  note: z.string().max(1_000).nullable(),
});

export const transactionSchema = baseEntitySchema.extend({
  kind: z.enum(['income', 'expense']),
  /** Amount in minor units (paise/cents) to avoid floating-point errors. */
  amountMinor: z.number().int().positive().max(1e13),
  currency: currencyCode,
  category: z.string().trim().min(1).max(60),
  note: z.string().max(500).nullable(),
  occurredAt: isoDateTime,
  recurringId: z.uuid().nullable(),
});

export const budgetSchema = baseEntitySchema.extend({
  category: z.string().trim().min(1).max(60),
  limitMinor: z.number().int().positive().max(1e13),
  currency: currencyCode,
  period: z.enum(['monthly']),
});

export const recurringPaymentSchema = baseEntitySchema.extend({
  name: short,
  kind: z.enum(['bill', 'subscription']),
  amountMinor: z.number().int().positive().max(1e13),
  currency: currencyCode,
  category: z.string().trim().min(1).max(60),
  frequency: z.enum(['weekly', 'monthly', 'yearly']),
  nextDueAt: isoDateTime,
  active: z.boolean(),
  remindDaysBefore: z.number().int().min(0).max(30),
});

export const goalSchema = baseEntitySchema.extend({
  title: short,
  kind: z.enum(['personal', 'financial', 'fitness', 'learning']),
  targetValue: z.number().nonnegative().nullable(),
  currentValue: z.number().nonnegative(),
  unit: z.string().max(30).nullable(),
  deadline: isoDateTime.nullable(),
  status: z.enum(['active', 'achieved', 'abandoned']),
});

export const routineSchema = baseEntitySchema.extend({
  name: short,
  timeOfDay: z.enum(['morning', 'afternoon', 'evening', 'night']),
  time: timeOfDay.nullable(),
  /** 0 = Sunday … 6 = Saturday */
  days: z.array(z.number().int().min(0).max(6)).max(7),
  steps: z.array(z.string().trim().min(1).max(200)).max(30),
  active: z.boolean(),
});

export const entitySchemas = {
  task: taskSchema,
  event: eventSchema,
  reminder: reminderSchema,
  note: noteSchema,
  project: projectSchema,
  habit: habitSchema,
  habitLog: habitLogSchema,
  wellness: wellnessSchema,
  transaction: transactionSchema,
  budget: budgetSchema,
  recurringPayment: recurringPaymentSchema,
  goal: goalSchema,
  routine: routineSchema,
} as const;

export type EntityType = keyof typeof entitySchemas;
export const entityTypes = Object.keys(entitySchemas) as EntityType[];
export const entityTypeSchema = z.enum(entityTypes as [EntityType, ...EntityType[]]);

export type Task = z.infer<typeof taskSchema>;
export type CalendarEvent = z.infer<typeof eventSchema>;
export type Reminder = z.infer<typeof reminderSchema>;
export type Note = z.infer<typeof noteSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Habit = z.infer<typeof habitSchema>;
export type HabitLog = z.infer<typeof habitLogSchema>;
export type WellnessEntry = z.infer<typeof wellnessSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type Budget = z.infer<typeof budgetSchema>;
export type RecurringPayment = z.infer<typeof recurringPaymentSchema>;
export type Goal = z.infer<typeof goalSchema>;
export type Routine = z.infer<typeof routineSchema>;

export interface EntityMap {
  task: Task;
  event: CalendarEvent;
  reminder: Reminder;
  note: Note;
  project: Project;
  habit: Habit;
  habitLog: HabitLog;
  wellness: WellnessEntry;
  transaction: Transaction;
  budget: Budget;
  recurringPayment: RecurringPayment;
  goal: Goal;
  routine: Routine;
}

export type AnyEntity = EntityMap[EntityType];

/** Fields of an entity that a client may set (envelope fields are managed). */
export type EntityInput<T extends EntityType> = Omit<
  EntityMap[T],
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'version'
>;

export const ENVELOPE_FIELDS = ['id', 'createdAt', 'updatedAt', 'deletedAt', 'version'] as const;
