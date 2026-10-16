import { z } from 'zod';
import { currencyCode, entityTypeSchema, isoDateTime, timeOfDay } from './entities';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const emailSchema = z.email().max(254).transform((e) => e.toLowerCase());
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long');

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(80),
});
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
export const guestSchema = z.object({ deviceName: z.string().max(80).optional() });
export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(512) });
export const claimGuestSchema = registerSchema;

export const userSchema = z.object({
  id: z.uuid(),
  email: z.string().nullable(),
  name: z.string(),
  isGuest: z.boolean(),
  createdAt: isoDateTime,
});
export type User = z.infer<typeof userSchema>;

export const authResponseSchema = z.object({
  user: userSchema,
  accessToken: z.string(),
  refreshToken: z.string(),
  accessTokenExpiresAt: isoDateTime,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export const languageSchema = z.enum(['auto', 'en', 'hi', 'hinglish', 'es', 'fr', 'de', 'bn', 'ta', 'te', 'mr']);
export type Language = z.infer<typeof languageSchema>;

export const preferencesSchema = z.object({
  assistantName: z.string().trim().min(1).max(30),
  language: languageSchema,
  tone: z.enum(['friendly', 'concise', 'professional', 'playful']),
  theme: z.enum(['system', 'light', 'dark']),
  timezone: z.string().min(1).max(64),
  currency: currencyCode,
  units: z.enum(['metric', 'imperial']),
  voice: z.object({
    enabled: z.boolean(),
    autoSpeakReplies: z.boolean(),
    rate: z.number().min(0.5).max(2),
    pitch: z.number().min(0.5).max(2),
    voiceId: z.string().max(200).nullable(),
  }),
  briefings: z.object({
    morningEnabled: z.boolean(),
    morningTime: timeOfDay,
    eveningEnabled: z.boolean(),
    eveningTime: timeOfDay,
  }),
  wellnessTargets: z.object({
    waterMl: z.number().int().min(0).max(10_000),
    sleepHours: z.number().min(0).max(16),
    exerciseMinutes: z.number().int().min(0).max(600),
    steps: z.number().int().min(0).max(100_000),
  }),
  location: z
    .object({
      name: z.string().max(120),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .nullable(),
  memoryEnabled: z.boolean(),
  webSearchEnabled: z.boolean(),
});
export type Preferences = z.infer<typeof preferencesSchema>;
export const updatePreferencesSchema = preferencesSchema.partial();

export const defaultPreferences: Preferences = {
  assistantName: 'Aura',
  language: 'auto',
  tone: 'friendly',
  theme: 'system',
  timezone: 'Asia/Kolkata',
  currency: 'INR',
  units: 'metric',
  voice: { enabled: true, autoSpeakReplies: true, rate: 1, pitch: 1, voiceId: null },
  briefings: { morningEnabled: true, morningTime: '07:30', eveningEnabled: true, eveningTime: '21:00' },
  wellnessTargets: { waterMl: 2500, sleepHours: 8, exerciseMinutes: 30, steps: 8000 },
  location: null,
  memoryEnabled: true,
  webSearchEnabled: true,
};

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export const syncChangeSchema = z.object({
  type: entityTypeSchema,
  op: z.enum(['upsert', 'delete']),
  /** Full record for upserts; for deletes at least { id, updatedAt }. */
  data: z.record(z.string(), z.unknown()),
  /** Version the client last saw from the server (0 if never synced). */
  baseVersion: z.number().int().nonnegative(),
});
export type SyncChange = z.infer<typeof syncChangeSchema>;

export const syncPushSchema = z.object({ changes: z.array(syncChangeSchema).max(500) });

export const syncResultSchema = z.object({
  type: entityTypeSchema,
  id: z.string(),
  status: z.enum(['applied', 'conflict_server_won', 'conflict_client_won', 'rejected']),
  record: z.record(z.string(), z.unknown()).nullable(),
  error: z.string().optional(),
});
export type SyncResult = z.infer<typeof syncResultSchema>;
export const syncPushResponseSchema = z.object({ results: z.array(syncResultSchema) });
export type SyncPushResponse = z.infer<typeof syncPushResponseSchema>;

export const syncPullQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});
export const syncPullResponseSchema = z.object({
  changes: z.array(z.object({ type: entityTypeSchema, record: z.record(z.string(), z.unknown()) })),
  cursor: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});
export type SyncPullResponse = z.infer<typeof syncPullResponseSchema>;

// ---------------------------------------------------------------------------
// Chat & agent
// ---------------------------------------------------------------------------

export const conversationSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  lastMessagePreview: z.string().nullable(),
});
export type Conversation = z.infer<typeof conversationSchema>;

export const sourceSchema = z.object({ title: z.string(), url: z.string() });
export type Source = z.infer<typeof sourceSchema>;

export const toolCallSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  label: z.string(),
  status: z.enum(['succeeded', 'failed', 'awaiting_confirmation', 'rejected', 'cancelled']),
  summary: z.string(),
  pendingActionId: z.uuid().nullable(),
  /** Optional structured payload the UI can render (e.g. a message draft). */
  display: z.record(z.string(), z.unknown()).nullable(),
});
export type ToolCallSummary = z.infer<typeof toolCallSummarySchema>;

export const chatMessageSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  role: z.enum(['user', 'assistant', 'event']),
  text: z.string(),
  toolCalls: z.array(toolCallSummarySchema),
  sources: z.array(sourceSchema),
  status: z.enum(['complete', 'error', 'cancelled']),
  createdAt: isoDateTime,
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const attachmentSchema = z.object({
  kind: z.enum(['image', 'document']),
  documentId: z.uuid(),
});

export const sendMessageSchema = z.object({
  text: z.string().trim().min(1).max(8_000),
  clientMessageId: z.uuid().optional(),
  attachments: z.array(attachmentSchema).max(4).optional(),
  /** Device-local context (the device knows the user's local clock). */
  clientNow: isoDateTime.optional(),
  inputMode: z.enum(['text', 'voice']).default('text'),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/** Server-sent events emitted while the agent processes a message. */
export type ChatStreamEvent =
  | { type: 'user_message'; message: ChatMessage }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; id: string; name: string; label: string }
  | { type: 'tool_end'; call: ToolCallSummary }
  | { type: 'sources'; sources: Source[] }
  | { type: 'done'; message: ChatMessage }
  | { type: 'error'; code: string; message: string };

// ---------------------------------------------------------------------------
// Pending actions (confirmation-gated tool calls)
// ---------------------------------------------------------------------------

export const pendingActionSchema = z.object({
  id: z.uuid(),
  toolName: z.string(),
  label: z.string(),
  description: z.string(),
  input: z.record(z.string(), z.unknown()),
  status: z.enum(['pending', 'confirmed', 'rejected', 'expired', 'failed']),
  result: z.string().nullable(),
  conversationId: z.uuid().nullable(),
  createdAt: isoDateTime,
  expiresAt: isoDateTime,
});
export type PendingAction = z.infer<typeof pendingActionSchema>;

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

export const memoryCategorySchema = z.enum(['preference', 'fact', 'person', 'goal', 'routine', 'other']);
export const memorySchema = z.object({
  id: z.uuid(),
  content: z.string(),
  category: memoryCategorySchema,
  source: z.enum(['user', 'assistant']),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Memory = z.infer<typeof memorySchema>;
export const createMemorySchema = z.object({
  content: z.string().trim().min(2).max(500),
  category: memoryCategorySchema.default('other'),
});
export const updateMemorySchema = createMemorySchema.partial();

// ---------------------------------------------------------------------------
// Documents / knowledge base
// ---------------------------------------------------------------------------

export const SUPPORTED_DOCUMENT_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

export const uploadDocumentSchema = z.object({
  name: z.string().trim().min(1).max(200),
  mimeType: z.enum(SUPPORTED_DOCUMENT_TYPES),
  /** Base64 payload (no data: prefix). */
  dataBase64: z.string().min(1).max(Math.ceil((MAX_DOCUMENT_BYTES * 4) / 3) + 8),
});

export const documentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  summary: z.string().nullable(),
  status: z.enum(['uploaded', 'processing', 'ready', 'failed']),
  hasText: z.boolean(),
  createdAt: isoDateTime,
});
export type DocumentInfo = z.infer<typeof documentSchema>;

export const askDocumentSchema = z.object({ question: z.string().trim().min(1).max(2_000) });

export const knowledgeSearchResultSchema = z.object({
  kind: z.enum(['note', 'document', 'memory']),
  id: z.string(),
  title: z.string(),
  snippet: z.string(),
  rank: z.number(),
});
export type KnowledgeSearchResult = z.infer<typeof knowledgeSearchResultSchema>;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export const weatherSchema = z.object({
  location: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  current: z.object({
    temperatureC: z.number(),
    apparentTemperatureC: z.number().nullable(),
    humidity: z.number().nullable(),
    windKph: z.number().nullable(),
    condition: z.string(),
    code: z.number(),
  }),
  daily: z.array(
    z.object({
      date: z.string(),
      minC: z.number(),
      maxC: z.number(),
      precipitationChance: z.number().nullable(),
      condition: z.string(),
    }),
  ),
  source: sourceSchema,
  fetchedAt: isoDateTime,
});
export type Weather = z.infer<typeof weatherSchema>;

export const webSearchResultSchema = z.object({
  answer: z.string(),
  sources: z.array(sourceSchema),
});
export type WebSearchResult = z.infer<typeof webSearchResultSchema>;

export const translateSchema = z.object({
  text: z.string().trim().min(1).max(5_000),
  targetLanguage: z.string().trim().min(2).max(40),
});

export const writeAssistSchema = z.object({
  kind: z.enum(['email', 'message', 'summary', 'rewrite', 'code', 'general']),
  instructions: z.string().trim().min(1).max(4_000),
  text: z.string().max(30_000).optional(),
});

// ---------------------------------------------------------------------------
// Briefings
// ---------------------------------------------------------------------------

export const briefingSchema = z.object({
  kind: z.enum(['morning', 'evening']),
  date: z.string(),
  greeting: z.string(),
  aiSummary: z.string().nullable(),
  aiAvailable: z.boolean(),
  sections: z.array(
    z.object({
      title: z.string(),
      items: z.array(z.string()),
    }),
  ),
  weather: weatherSchema.nullable(),
  generatedAt: isoDateTime,
});
export type Briefing = z.infer<typeof briefingSchema>;

export const rescheduleSuggestionSchema = z.object({
  taskId: z.uuid(),
  title: z.string(),
  originalDueAt: isoDateTime,
  suggestedDueAt: isoDateTime,
  reason: z.string(),
});
export type RescheduleSuggestion = z.infer<typeof rescheduleSuggestionSchema>;

// ---------------------------------------------------------------------------
// Finance
// ---------------------------------------------------------------------------

export const financeSummarySchema = z.object({
  month: z.string(),
  currency: z.string(),
  incomeMinor: z.number(),
  expenseMinor: z.number(),
  netMinor: z.number(),
  byCategory: z.array(
    z.object({
      category: z.string(),
      spentMinor: z.number(),
      budgetMinor: z.number().nullable(),
    }),
  ),
  upcomingBills: z.array(
    z.object({ id: z.string(), name: z.string(), amountMinor: z.number(), dueAt: isoDateTime }),
  ),
  /** Transactions in currencies other than the summary currency are listed, not converted. */
  otherCurrencies: z.array(z.string()),
});
export type FinanceSummary = z.infer<typeof financeSummarySchema>;

// ---------------------------------------------------------------------------
// Automations
// ---------------------------------------------------------------------------

export const automationTriggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('manual') }),
  z.object({ type: z.literal('daily'), time: timeOfDay }),
  z.object({ type: z.literal('weekly'), time: timeOfDay, days: z.array(z.number().int().min(0).max(6)).min(1) }),
]);
export type AutomationTrigger = z.infer<typeof automationTriggerSchema>;

export const automationStepSchema = z.object({
  tool: z.string().min(1).max(60),
  input: z.record(z.string(), z.unknown()),
  label: z.string().max(120).optional(),
});
export type AutomationStep = z.infer<typeof automationStepSchema>;

export const createAutomationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional(),
  trigger: automationTriggerSchema,
  steps: z.array(automationStepSchema).min(1).max(10),
  enabled: z.boolean().default(true),
  maxRetries: z.number().int().min(0).max(3).default(1),
});
export const updateAutomationSchema = createAutomationSchema.partial();

export const automationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  trigger: automationTriggerSchema,
  steps: z.array(automationStepSchema),
  enabled: z.boolean(),
  maxRetries: z.number().int(),
  nextRunAt: isoDateTime.nullable(),
  lastRunAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
});
export type Automation = z.infer<typeof automationSchema>;

export const automationRunSchema = z.object({
  id: z.uuid(),
  automationId: z.uuid(),
  automationName: z.string(),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled', 'partial']),
  trigger: z.enum(['schedule', 'manual', 'retry']),
  attempt: z.number().int(),
  steps: z.array(
    z.object({
      tool: z.string(),
      label: z.string(),
      status: z.enum(['pending', 'succeeded', 'failed', 'skipped']),
      output: z.string().nullable(),
    }),
  ),
  error: z.string().nullable(),
  startedAt: isoDateTime.nullable(),
  finishedAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
});
export type AutomationRun = z.infer<typeof automationRunSchema>;

export const automationSuggestionSchema = z.object({
  name: z.string(),
  reason: z.string(),
  automation: createAutomationSchema,
});
export type AutomationSuggestion = z.infer<typeof automationSuggestionSchema>;

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export const healthSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  ai: z.object({ provider: z.string(), available: z.boolean(), model: z.string().nullable() }),
  features: z.object({ webSearch: z.boolean(), weather: z.boolean(), documents: z.boolean() }),
});
export type Health = z.infer<typeof healthSchema>;

export const pushTokenSchema = z.object({ token: z.string().min(10).max(300), platform: z.enum(['android', 'ios']) });

export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const idParamSchema = z.object({ id: z.uuid() });

export const deleteAccountSchema = z.object({ confirm: z.literal('DELETE MY ACCOUNT') });

export const isoDateTimeSchema = isoDateTime;
