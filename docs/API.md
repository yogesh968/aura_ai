# API reference

Base URL: `http://<host>:4000`. All `/v1` routes except signup, login, guest, refresh and logout require
`Authorization: Bearer <accessToken>`. Bodies are JSON and are validated with the Zod schemas in
`packages/shared/src/api.ts`.

**Errors** always look like:

```json
{ "error": { "code": "validation_error", "message": "Invalid request", "details": [{ "path": "email", "message": "Invalid email address" }] } }
```

| Status | Typical codes |
|---|---|
| 400 | `validation_error`, `bad_request` |
| 401 | `unauthorized`, `invalid_credentials` |
| 404 | `not_found` (also returned for other users' resources) |
| 409 | `conflict`, `action_already_decided`, `not_retryable` |
| 410 | `action_expired` |
| 429 | `rate_limited` |
| 503 | `ai_unavailable`, `weather_unreachable`, `web_search_unavailable` |

Rate limits: 300 requests/min per user (per IP when unauthenticated), 10/min on auth endpoints, 30/min for chat
messages, and 20/min for other AI endpoints.

## Health

`GET /health` → `{ status, version, ai: { provider, available, model }, features: { webSearch, weather, documents } }`

## Auth & account

| Method & path | Body → Response |
|---|---|
| `POST /v1/auth/register` | `{ email, password (≥8), name }` → `201 AuthResponse` |
| `POST /v1/auth/login` | `{ email, password }` → `AuthResponse` |
| `POST /v1/auth/guest` | `{}` → `201 AuthResponse` (guest account) |
| `POST /v1/auth/refresh` | `{ refreshToken }` → `AuthResponse` (rotates; reusing an old token revokes all sessions) |
| `POST /v1/auth/logout` | `{ refreshToken }` → `204` |
| `POST /v1/auth/logout-all` | → `204` |
| `GET /v1/auth/me` / `PATCH /v1/auth/me` | → `User` / `{ name }` → `User` |
| `POST /v1/auth/claim` | `{ email, password, name }` → `AuthResponse` (guest → full account, data kept) |
| `GET /v1/preferences` / `PATCH /v1/preferences` | `Preferences` / partial → `Preferences` |
| `PUT /v1/account/push-token` / `DELETE` | `{ token, platform }` → `204` |
| `GET /v1/account/export` | → JSON with all of your data |
| `DELETE /v1/account` | `{ confirm: "DELETE MY ACCOUNT" }` → `204` (cascades everything) |

`AuthResponse = { user, accessToken (15 min JWT), refreshToken (opaque, 30 days), accessTokenExpiresAt }`

## Sync (offline-first entities)

Entity types: `task, event, reminder, note, project, habit, habitLog, wellness, transaction, budget,
recurringPayment, goal, routine` (schemas in `packages/shared/src/entities.ts`).

`POST /v1/sync/push`

```json
{ "changes": [ { "type": "task", "op": "upsert", "baseVersion": 0, "data": { "id": "…uuid", "createdAt": "…", "updatedAt": "…", "deletedAt": null, "version": 0, "title": "Buy milk", "...": "…" } } ] }
```
→ `{ "results": [ { "type", "id", "status": "applied|conflict_server_won|conflict_client_won|rejected", "record": { … } | null, "error"? } ] }`

`GET /v1/sync/pull?since=<cursor>&limit=500` → `{ changes: [{ type, record }], cursor, hasMore }`

## Assistant

| Method & path | Notes |
|---|---|
| `GET /v1/conversations?limit&before` | most recent first, with `lastMessagePreview` |
| `POST /v1/conversations` | `{ title? }`. The tool set (incl. web search) is frozen at creation |
| `PATCH /v1/conversations/:id` · `DELETE …` | rename · delete |
| `GET /v1/conversations/:id/messages` | `ChatMessage[]` (`role: user · assistant · event`) |
| `POST /v1/conversations/:id/messages` | **SSE stream**, see below |
| `GET /v1/actions?status=pending\|all` | pending confirmations |
| `POST /v1/actions/:id/confirm` · `/reject` | executes or cancels a confirmation-gated tool call |

### Chat stream

Request: `SendMessageInput = { text, clientMessageId?, attachments?: [{ kind, documentId }], clientNow?, inputMode: "text" | "voice" }`.
Re-sending the same `clientMessageId` never runs the agent twice.

Response: `text/event-stream`. Each event is `event: <type>` plus `data: <json>`:

| type | payload |
|---|---|
| `user_message` | stored user message |
| `text_delta` | `{ text }` streamed assistant text |
| `tool_start` | `{ id, name, label }` |
| `tool_end` | `{ call: ToolCallSummary }`, where `status` is `succeeded`, `failed` or `awaiting_confirmation` (`pendingActionId`), plus an optional `display` payload (`message_draft`, `reschedule`, `weather`, `task`, …) |
| `sources` | `[{ title, url }]` from web search / weather |
| `done` | final `ChatMessage` |
| `error` | `{ code, message }` |

Closing the connection cancels the turn.

## Knowledge, memory & documents

| Method & path | Notes |
|---|---|
| `GET/POST /v1/memories`, `PATCH/DELETE /v1/memories/:id`, `DELETE /v1/memories` | user-controlled memory |
| `GET /v1/documents`, `POST /v1/documents` | upload `{ name, mimeType, dataBase64 }` (PDF, text, markdown, CSV, JPEG/PNG/WebP/GIF; ≤ 8 MB) |
| `GET/DELETE /v1/documents/:id` | detail incl. `textPreview` |
| `POST /v1/documents/:id/summarize` · `/ask { question }` | AI with no tools (injection-safe) |
| `GET /v1/knowledge/search?q&limit` | full-text over notes, documents and memories |

## Planner, finance, briefing & utilities

| Method & path | Notes |
|---|---|
| `GET /v1/planner/agenda?date=YYYY-MM-DD` | tasks due, overdue, events (recurrences expanded), reminders, habits, wellness |
| `GET /v1/planner/reschedule` | free-slot suggestions for missed tasks (not applied) |
| `GET /v1/finance/summary?month=YYYY-MM` | income/expense/net, by category vs budgets, upcoming bills |
| `GET /v1/finance/export.csv` | CSV of all transactions |
| `GET /v1/briefing/morning\|evening` | structured sections plus an optional AI summary built only from those facts |
| `GET /v1/weather?q=` or `?lat&lon` (or saved home location) · `GET /v1/geocode?q=` | Open-Meteo, with source and fetch time |
| `POST /v1/utils/calculate { expression }` · `POST /v1/utils/convert { value, from, to }` | deterministic |
| `POST /v1/web/search { query }` | Claude web search → `{ answer, sources }` |
| `POST /v1/ai/translate { text, targetLanguage }` · `POST /v1/ai/write { kind, instructions, text? }` | |
| `GET /v1/notifications` · `POST /v1/notifications/read { ids \| "all" }` | inbox |
| `GET /v1/tools` · `GET /v1/tool-executions` | tool catalog (with JSON Schemas) · audit log |

## Automations

| Method & path | Notes |
|---|---|
| `GET/POST /v1/automations` | `{ name, description?, trigger, steps[≤10], enabled, maxRetries ≤ 3 }`. Only `automatable` tools are allowed |
| `GET/PATCH/DELETE /v1/automations/:id` | |
| `POST /v1/automations/:id/run` | run now → `AutomationRun` |
| `GET /v1/automations/runs?automationId` | history with per-step status |
| `POST /v1/automations/runs/:id/cancel` · `/retry` | cancel a queued/running run · retry a failed/partial/cancelled run |
| `GET /v1/automations/suggestions` | derived from your routines, habits and bills; nothing is created until you accept |

Triggers: `{ type: "manual" }`, `{ type: "daily", time: "HH:mm" }`, `{ type: "weekly", time, days: [0-6] }`
(evaluated in your timezone). String inputs may use templates: `{{today}}`, `{{tomorrow}}`, `{{now}}`,
`{{today@18:00}}`, `{{tomorrow@09:30}}`.
