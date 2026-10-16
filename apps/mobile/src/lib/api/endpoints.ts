import type {
  AuthResponse,
  Automation,
  AutomationRun,
  AutomationStep,
  AutomationSuggestion,
  AutomationTrigger,
  Briefing,
  ChatMessage,
  Conversation,
  DocumentInfo,
  FinanceSummary,
  Health,
  KnowledgeSearchResult,
  Memory,
  PendingAction,
  Preferences,
  RescheduleSuggestion,
  SyncChange,
  SyncPullResponse,
  SyncPushResponse,
  User,
  Weather,
  WebSearchResult,
} from '@aura/shared';
import { api } from './client';

export interface InboxItem {
  id: string;
  title: string;
  body: string;
  kind: string;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface ToolCatalogItem {
  name: string;
  label: string;
  description: string;
  category: string;
  permission: 'read' | 'write' | 'confirm';
  automatable: boolean;
  inputSchema: Record<string, unknown>;
}

export interface ToolExecutionItem {
  id: string;
  toolName: string;
  status: string;
  summary: string;
  source: 'chat' | 'automation';
  durationMs: number;
  createdAt: string;
}

export interface AgendaResponse {
  date: string;
  timezone: string;
  tasksDue: unknown[];
  overdueTasks: unknown[];
  events: unknown[];
  reminders: unknown[];
  habits: unknown[];
  wellness: Record<string, number>;
}

/** Typed wrappers for every backend endpoint. */
export const endpoints = {
  health: () => api<Health>('/health', { auth: false, timeoutMs: 6000 }),

  auth: {
    register: (b: { email: string; password: string; name: string }) =>
      api<AuthResponse>('/v1/auth/register', { method: 'POST', body: b, auth: false }),
    login: (b: { email: string; password: string }) => api<AuthResponse>('/v1/auth/login', { method: 'POST', body: b, auth: false }),
    guest: () => api<AuthResponse>('/v1/auth/guest', { method: 'POST', body: {}, auth: false }),
    logout: (refreshToken: string) => api<void>('/v1/auth/logout', { method: 'POST', body: { refreshToken }, auth: false }),
    logoutAll: () => api<void>('/v1/auth/logout-all', { method: 'POST' }),
    me: () => api<User>('/v1/auth/me'),
    updateMe: (b: { name: string }) => api<User>('/v1/auth/me', { method: 'PATCH', body: b }),
    claim: (b: { email: string; password: string; name: string }) => api<AuthResponse>('/v1/auth/claim', { method: 'POST', body: b }),
  },

  account: {
    exportAll: () => api<string>('/v1/account/export', { raw: true, timeoutMs: 60_000 }),
    delete: () => api<void>('/v1/account', { method: 'DELETE', body: { confirm: 'DELETE MY ACCOUNT' } }),
    setPushToken: (token: string) => api<void>('/v1/account/push-token', { method: 'PUT', body: { token, platform: 'android' } }),
    clearPushToken: () => api<void>('/v1/account/push-token', { method: 'DELETE' }),
  },

  preferences: {
    get: () => api<Preferences>('/v1/preferences'),
    update: (patch: Partial<Preferences>) => api<Preferences>('/v1/preferences', { method: 'PATCH', body: patch }),
  },

  sync: {
    push: (changes: SyncChange[]) => api<SyncPushResponse>('/v1/sync/push', { method: 'POST', body: { changes }, timeoutMs: 30_000 }),
    pull: (since: number, limit = 500) => api<SyncPullResponse>('/v1/sync/pull', { query: { since, limit }, timeoutMs: 30_000 }),
  },

  conversations: {
    list: (before?: string) => api<Conversation[]>('/v1/conversations', { query: { before } }),
    create: (title?: string) => api<Conversation>('/v1/conversations', { method: 'POST', body: title ? { title } : {} }),
    rename: (id: string, title: string) => api<Conversation>(`/v1/conversations/${id}`, { method: 'PATCH', body: { title } }),
    remove: (id: string) => api<void>(`/v1/conversations/${id}`, { method: 'DELETE' }),
    messages: (id: string) => api<ChatMessage[]>(`/v1/conversations/${id}/messages`),
  },

  actions: {
    list: (status: 'pending' | 'all' = 'pending') => api<PendingAction[]>('/v1/actions', { query: { status } }),
    confirm: (id: string) => api<PendingAction>(`/v1/actions/${id}/confirm`, { method: 'POST' }),
    reject: (id: string) => api<PendingAction>(`/v1/actions/${id}/reject`, { method: 'POST' }),
  },

  memories: {
    list: () => api<Memory[]>('/v1/memories'),
    create: (b: { content: string; category?: Memory['category'] }) => api<Memory>('/v1/memories', { method: 'POST', body: b }),
    update: (id: string, b: { content?: string; category?: Memory['category'] }) => api<Memory>(`/v1/memories/${id}`, { method: 'PATCH', body: b }),
    remove: (id: string) => api<void>(`/v1/memories/${id}`, { method: 'DELETE' }),
    removeAll: () => api<{ deleted: number }>('/v1/memories', { method: 'DELETE' }),
  },

  documents: {
    list: () => api<DocumentInfo[]>('/v1/documents'),
    get: (id: string) => api<DocumentInfo & { textPreview: string | null }>(`/v1/documents/${id}`),
    upload: (b: { name: string; mimeType: string; dataBase64: string }) =>
      api<DocumentInfo>('/v1/documents', { method: 'POST', body: b, timeoutMs: 120_000 }),
    remove: (id: string) => api<void>(`/v1/documents/${id}`, { method: 'DELETE' }),
    summarize: (id: string) => api<DocumentInfo>(`/v1/documents/${id}/summarize`, { method: 'POST', timeoutMs: 180_000 }),
    ask: (id: string, question: string) =>
      api<{ answer: string }>(`/v1/documents/${id}/ask`, { method: 'POST', body: { question }, timeoutMs: 180_000 }),
  },

  knowledge: {
    search: (q: string, limit = 10) => api<KnowledgeSearchResult[]>('/v1/knowledge/search', { query: { q, limit } }),
  },

  planner: {
    agenda: (date: string) => api<AgendaResponse>('/v1/planner/agenda', { query: { date } }),
    reschedule: () => api<RescheduleSuggestion[]>('/v1/planner/reschedule'),
  },

  finance: {
    summary: (month?: string) => api<FinanceSummary>('/v1/finance/summary', { query: { month } }),
    exportCsv: () => api<string>('/v1/finance/export.csv', { raw: true, timeoutMs: 60_000 }),
  },

  briefing: (kind: 'morning' | 'evening') => api<Briefing>(`/v1/briefing/${kind}`, { timeoutMs: 120_000 }),

  weather: {
    byQuery: (q: string) => api<Weather>('/v1/weather', { query: { q } }),
    byCoords: (lat: number, lon: number, name?: string) => api<Weather>('/v1/weather', { query: { lat, lon, name } }),
    home: () => api<Weather>('/v1/weather'),
    geocode: (q: string) => api<{ name: string; latitude: number; longitude: number }>('/v1/geocode', { query: { q } }),
  },

  utils: {
    calculate: (expression: string) => api<{ expression: string; result: number }>('/v1/utils/calculate', { method: 'POST', body: { expression } }),
    convert: (value: number, from: string, to: string) =>
      api<{ value: number; from: string; to: string }>('/v1/utils/convert', { method: 'POST', body: { value, from, to } }),
  },

  ai: {
    webSearch: (query: string) => api<WebSearchResult>('/v1/web/search', { method: 'POST', body: { query }, timeoutMs: 180_000 }),
    translate: (text: string, targetLanguage: string) =>
      api<{ translation: string }>('/v1/ai/translate', { method: 'POST', body: { text, targetLanguage }, timeoutMs: 120_000 }),
    write: (b: { kind: 'email' | 'message' | 'summary' | 'rewrite' | 'code' | 'general'; instructions: string; text?: string }) =>
      api<{ text: string }>('/v1/ai/write', { method: 'POST', body: b, timeoutMs: 180_000 }),
  },

  automations: {
    list: () => api<Automation[]>('/v1/automations'),
    get: (id: string) => api<Automation>(`/v1/automations/${id}`),
    create: (b: { name: string; description?: string; trigger: AutomationTrigger; steps: AutomationStep[]; enabled?: boolean; maxRetries?: number }) =>
      api<Automation>('/v1/automations', { method: 'POST', body: b }),
    update: (id: string, b: Partial<{ name: string; description: string; trigger: AutomationTrigger; steps: AutomationStep[]; enabled: boolean; maxRetries: number }>) =>
      api<Automation>(`/v1/automations/${id}`, { method: 'PATCH', body: b }),
    remove: (id: string) => api<void>(`/v1/automations/${id}`, { method: 'DELETE' }),
    run: (id: string) => api<AutomationRun>(`/v1/automations/${id}/run`, { method: 'POST', timeoutMs: 120_000 }),
    runs: (automationId?: string) => api<AutomationRun[]>('/v1/automations/runs', { query: { automationId } }),
    cancelRun: (id: string) => api<AutomationRun>(`/v1/automations/runs/${id}/cancel`, { method: 'POST' }),
    retryRun: (id: string) => api<AutomationRun>(`/v1/automations/runs/${id}/retry`, { method: 'POST', timeoutMs: 120_000 }),
    suggestions: () => api<AutomationSuggestion[]>('/v1/automations/suggestions'),
  },

  notifications: {
    list: () => api<InboxItem[]>('/v1/notifications'),
    markRead: (ids: string[] | 'all') => api<{ updated: number }>('/v1/notifications/read', { method: 'POST', body: { ids } }),
  },

  tools: {
    catalog: () => api<ToolCatalogItem[]>('/v1/tools'),
    executions: () => api<ToolExecutionItem[]>('/v1/tool-executions'),
  },
};
