import { z } from 'zod';
import { currencyCode, dateKey, isoDateTime, recurrenceSchema, wellnessMetricSchema } from './entities';
import { memoryCategorySchema } from './api';

/**
 * Typed tool catalog for the AURA agent.
 *
 * Every tool the model (or an automation) can invoke is declared here with a
 * Zod input schema, a human label, and its permission class. The backend
 * executes them; the mobile app uses the metadata to render tool cards and to
 * build automations. There is intentionally no generic "run code", "shell" or
 * "SQL" tool.
 */

export type ToolPermission =
  /** Reads the user's own data. */
  | 'read'
  /** Creates/updates the user's own data; reversible. */
  | 'write'
  /** Destructive or consequential; always requires explicit user confirmation. */
  | 'confirm';

export interface ToolDefinition<S extends z.ZodType = z.ZodType> {
  name: string;
  label: string;
  description: string;
  category: 'planner' | 'notes' | 'memory' | 'wellness' | 'finance' | 'info' | 'communication' | 'system';
  permission: ToolPermission;
  /** Whether automations may use this tool (consequential tools are excluded). */
  automatable: boolean;
  input: S;
}

const optionalDateTime = isoDateTime.optional().describe('ISO 8601 date-time with UTC offset');

function tool<S extends z.ZodType>(def: ToolDefinition<S>): ToolDefinition<S> {
  return def;
}

export const toolDefinitions = {
  get_agenda: tool({
    name: 'get_agenda',
    label: 'Check agenda',
    description:
      "Get the user's agenda for a day: tasks due, events, reminders and habit progress. Use for 'what's on today', 'plan my day', briefings.",
    category: 'planner',
    permission: 'read',
    automatable: true,
    input: z.object({ date: dateKey.optional().describe('YYYY-MM-DD in the user timezone; defaults to today') }),
  }),
  list_tasks: tool({
    name: 'list_tasks',
    label: 'Look up tasks',
    description: 'List or search tasks. Filter by status, due date, project or a text query.',
    category: 'planner',
    permission: 'read',
    automatable: true,
    input: z.object({
      status: z.enum(['open', 'done', 'overdue', 'all']).optional(),
      query: z.string().max(200).optional(),
      dueBefore: optionalDateTime,
      projectId: z.uuid().optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
  }),
  create_task: tool({
    name: 'create_task',
    label: 'Create task',
    description: 'Create a to-do task. Use remindAt only if the user wants a notification for it.',
    category: 'planner',
    permission: 'write',
    automatable: true,
    input: z.object({
      title: z.string().trim().min(1).max(200),
      notes: z.string().max(5000).optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      dueAt: optionalDateTime,
      remindAt: optionalDateTime,
      recurrence: recurrenceSchema.optional(),
      projectId: z.uuid().optional(),
      tags: z.array(z.string().max(40)).max(10).optional(),
      estimateMinutes: z.number().int().positive().max(1440).optional(),
    }),
  }),
  update_task: tool({
    name: 'update_task',
    label: 'Update task',
    description: 'Update fields of an existing task (e.g. reschedule, rename, change priority).',
    category: 'planner',
    permission: 'write',
    automatable: false,
    input: z.object({
      id: z.uuid(),
      title: z.string().trim().min(1).max(200).optional(),
      notes: z.string().max(5000).optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      status: z.enum(['todo', 'in_progress', 'done', 'cancelled']).optional(),
      dueAt: isoDateTime.nullable().optional(),
      remindAt: isoDateTime.nullable().optional(),
      recurrence: recurrenceSchema.optional(),
    }),
  }),
  complete_task: tool({
    name: 'complete_task',
    label: 'Complete task',
    description: 'Mark a task as done.',
    category: 'planner',
    permission: 'write',
    automatable: false,
    input: z.object({ id: z.uuid() }),
  }),
  delete_task: tool({
    name: 'delete_task',
    label: 'Delete task',
    description: 'Delete a task. Requires user confirmation.',
    category: 'planner',
    permission: 'confirm',
    automatable: false,
    input: z.object({ id: z.uuid() }),
  }),
  create_reminder: tool({
    name: 'create_reminder',
    label: 'Set reminder',
    description: "Set a reminder notification at a specific time, e.g. 'remind me tomorrow at 9 AM to call mom'.",
    category: 'planner',
    permission: 'write',
    automatable: true,
    input: z.object({
      title: z.string().trim().min(1).max(200),
      remindAt: isoDateTime.describe('ISO 8601 date-time with UTC offset, in the future'),
      recurrence: recurrenceSchema.optional(),
      notes: z.string().max(2000).optional(),
    }),
  }),
  list_reminders: tool({
    name: 'list_reminders',
    label: 'Look up reminders',
    description: 'List reminders, by default only upcoming ones that are not done.',
    category: 'planner',
    permission: 'read',
    automatable: true,
    input: z.object({ includePast: z.boolean().optional() }),
  }),
  delete_reminder: tool({
    name: 'delete_reminder',
    label: 'Delete reminder',
    description: 'Delete a reminder. Requires user confirmation.',
    category: 'planner',
    permission: 'confirm',
    automatable: false,
    input: z.object({ id: z.uuid() }),
  }),
  create_event: tool({
    name: 'create_event',
    label: 'Add to calendar',
    description: 'Add an event, appointment or birthday to the AURA calendar.',
    category: 'planner',
    permission: 'write',
    automatable: true,
    input: z.object({
      title: z.string().trim().min(1).max(200),
      startAt: isoDateTime,
      endAt: optionalDateTime,
      allDay: z.boolean().optional(),
      location: z.string().max(300).optional(),
      notes: z.string().max(5000).optional(),
      kind: z.enum(['event', 'appointment', 'birthday']).optional(),
      recurrence: recurrenceSchema.optional(),
      reminderMinutesBefore: z.number().int().min(0).max(20160).optional(),
    }),
  }),
  list_events: tool({
    name: 'list_events',
    label: 'Check calendar',
    description: 'List calendar events between two date-times.',
    category: 'planner',
    permission: 'read',
    automatable: true,
    input: z.object({ from: isoDateTime, to: isoDateTime }),
  }),
  create_project_plan: tool({
    name: 'create_project_plan',
    label: 'Create project plan',
    description:
      'Create a project with a bounded list of sub-tasks (max 20). Use for "plan my project", breaking a goal into steps.',
    category: 'planner',
    permission: 'write',
    automatable: false,
    input: z.object({
      name: z.string().trim().min(1).max(200),
      description: z.string().max(5000).optional(),
      deadline: optionalDateTime,
      tasks: z
        .array(
          z.object({
            title: z.string().trim().min(1).max(200),
            dueAt: optionalDateTime,
            priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
            estimateMinutes: z.number().int().positive().max(1440).optional(),
          }),
        )
        .min(1)
        .max(20),
    }),
  }),
  get_reschedule_suggestions: tool({
    name: 'get_reschedule_suggestions',
    label: 'Suggest reschedules',
    description: 'Find overdue/missed tasks and suggest new times based on the free slots in the agenda.',
    category: 'planner',
    permission: 'read',
    automatable: true,
    input: z.object({}),
  }),
  create_note: tool({
    name: 'create_note',
    label: 'Save note',
    description: 'Save a note or journal entry to the user’s knowledge base.',
    category: 'notes',
    permission: 'write',
    automatable: true,
    input: z.object({
      title: z.string().trim().max(200),
      content: z.string().min(1).max(50_000),
      tags: z.array(z.string().max(40)).max(10).optional(),
      kind: z.enum(['note', 'journal']).optional(),
    }),
  }),
  delete_note: tool({
    name: 'delete_note',
    label: 'Delete note',
    description: 'Delete a note. Requires user confirmation.',
    category: 'notes',
    permission: 'confirm',
    automatable: false,
    input: z.object({ id: z.uuid() }),
  }),
  search_knowledge: tool({
    name: 'search_knowledge',
    label: 'Search notes & documents',
    description: "Full-text search across the user's notes, uploaded documents and saved memories.",
    category: 'notes',
    permission: 'read',
    automatable: false,
    input: z.object({ query: z.string().trim().min(1).max(200), limit: z.number().int().min(1).max(20).optional() }),
  }),
  save_memory: tool({
    name: 'save_memory',
    label: 'Remember this',
    description:
      'Save a durable fact or preference about the user to long-term memory. Only for information the user would want remembered. Requires user confirmation.',
    category: 'memory',
    permission: 'confirm',
    automatable: false,
    input: z.object({ content: z.string().trim().min(2).max(500), category: memoryCategorySchema.optional() }),
  }),
  log_wellness: tool({
    name: 'log_wellness',
    label: 'Log wellness',
    description: 'Log water (ml), sleep (hours), exercise (minutes), weight (kg), mood (1-5) or steps.',
    category: 'wellness',
    permission: 'write',
    automatable: true,
    input: z.object({
      metric: wellnessMetricSchema,
      value: z.number().min(0).max(1_000_000),
      date: dateKey.optional(),
      note: z.string().max(500).optional(),
    }),
  }),
  log_habit: tool({
    name: 'log_habit',
    label: 'Log habit',
    description: 'Record progress on an existing habit, matched by name.',
    category: 'wellness',
    permission: 'write',
    automatable: true,
    input: z.object({
      habitName: z.string().trim().min(1).max(200),
      value: z.number().min(0).max(100_000).optional(),
      date: dateKey.optional(),
    }),
  }),
  create_habit: tool({
    name: 'create_habit',
    label: 'Create habit',
    description: 'Start tracking a new habit.',
    category: 'wellness',
    permission: 'write',
    automatable: false,
    input: z.object({
      name: z.string().trim().min(1).max(200),
      frequency: z.enum(['daily', 'weekly']).optional(),
      target: z.number().positive().max(100_000).optional(),
      unit: z.string().max(30).optional(),
    }),
  }),
  add_transaction: tool({
    name: 'add_transaction',
    label: 'Record transaction',
    description:
      'Record an income or expense the user tells you about (manual bookkeeping only — this never moves money).',
    category: 'finance',
    permission: 'write',
    automatable: true,
    input: z.object({
      kind: z.enum(['income', 'expense']),
      amount: z.number().positive().max(1e11).describe('Amount in major units, e.g. 250.50'),
      currency: currencyCode.optional(),
      category: z.string().trim().min(1).max(60),
      note: z.string().max(500).optional(),
      occurredAt: optionalDateTime,
    }),
  }),
  get_finance_summary: tool({
    name: 'get_finance_summary',
    label: 'Spending summary',
    description: 'Get income, expenses, budget usage and upcoming bills for a month.',
    category: 'finance',
    permission: 'read',
    automatable: true,
    input: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('YYYY-MM') }),
  }),
  get_weather: tool({
    name: 'get_weather',
    label: 'Check weather',
    description: "Get current weather and a 3-day forecast. Uses the user's saved location if none given.",
    category: 'info',
    permission: 'read',
    automatable: true,
    input: z.object({ location: z.string().trim().min(1).max(120).optional() }),
  }),
  calculate: tool({
    name: 'calculate',
    label: 'Calculate',
    description: 'Evaluate an arithmetic expression exactly (+ - * / ^ %, parentheses, sqrt, sin, cos, log, etc.).',
    category: 'info',
    permission: 'read',
    automatable: false,
    input: z.object({ expression: z.string().trim().min(1).max(500) }),
  }),
  convert_units: tool({
    name: 'convert_units',
    label: 'Convert units',
    description: 'Convert between units of length, mass, volume, temperature, speed, area, time and data.',
    category: 'info',
    permission: 'read',
    automatable: false,
    input: z.object({ value: z.number(), from: z.string().min(1).max(30), to: z.string().min(1).max(30) }),
  }),
  draft_message: tool({
    name: 'draft_message',
    label: 'Draft message',
    description:
      'Prepare a message or email draft for the user to review. AURA cannot send it; the user sends it from their own app.',
    category: 'communication',
    permission: 'read',
    automatable: false,
    input: z.object({
      channel: z.enum(['sms', 'email', 'whatsapp', 'other']),
      recipient: z.string().max(200).optional(),
      subject: z.string().max(300).optional(),
      body: z.string().min(1).max(10_000),
    }),
  }),
  notify: tool({
    name: 'notify',
    label: 'Send notification',
    description: 'Send a notification to the user’s own device (automations only).',
    category: 'system',
    permission: 'write',
    automatable: true,
    input: z.object({ title: z.string().trim().min(1).max(120), body: z.string().max(500) }),
  }),
  generate_briefing: tool({
    name: 'generate_briefing',
    label: 'Generate briefing',
    description: 'Generate the morning or evening briefing and notify the user (automations only).',
    category: 'system',
    permission: 'read',
    automatable: true,
    input: z.object({ kind: z.enum(['morning', 'evening']) }),
  }),
} as const;

export type ToolName = keyof typeof toolDefinitions;
export const toolNames = Object.keys(toolDefinitions) as ToolName[];
export type ToolInput<N extends ToolName> = z.infer<(typeof toolDefinitions)[N]['input']>;

/** Tools only automations may call (the chat agent does not get them). */
export const AUTOMATION_ONLY_TOOLS: readonly ToolName[] = ['notify', 'generate_briefing'];

export function isToolName(name: string): name is ToolName {
  return Object.prototype.hasOwnProperty.call(toolDefinitions, name);
}

export function toolLabel(name: string): string {
  return isToolName(name) ? toolDefinitions[name].label : name.replace(/_/g, ' ');
}
