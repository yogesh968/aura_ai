# Implementation checklist

Legend: ✅ done and verified by automated checks · 🟡 done, needs on-device / live-key verification · ⏳ planned

## Phase 1: Setup, design system, navigation, onboarding, dashboard
- ✅ npm-workspaces monorepo (`packages/shared`, `apps/backend`, `apps/mobile`), TypeScript strict everywhere
- ✅ Design tokens (light/dark, AA contrast), UI kit (buttons, cards, fields, sheets, date pickers, states, toasts, progress rings)
- ✅ Expo Router: signed-out flow guarded by `Stack.Protected`, custom tab bar with assistant orb (long-press → voice)
- ✅ Welcome carousel, consent (required), sign-in / sign-up / guest, first-run setup
- ✅ Home dashboard: offline quick-add NLP, local agenda, habits/water, bills, pending confirmations, quick actions, sync chip
- ✅ AURA brand icons (adaptive, monochrome, splash)

## Phase 2: Backend, database, auth, secure configuration
- ✅ Fastify 5 + Zod-validated routes, consistent error envelope, helmet, CORS allow-list, per-user rate limits (verified JWT subject)
- ✅ PostgreSQL + Prisma; sync sequence and version triggers; full-text indexes; embedded Postgres for dev and tests
- ✅ argon2id passwords, 15-min JWT access tokens, rotating hashed refresh tokens with reuse detection, guest → account upgrade
- ✅ Env validation at boot; secrets only on the server; log redaction
- ✅ Seed data (`npm run db:seed`)

## Phase 3: AI chat, history, voice
- ✅ Agent loop with streaming SSE, frozen system prompt/tools, append-only replay, compaction, idempotent retries, cancellation
- 🟡 Claude integration (`claude-opus-5-5`, adaptive thinking, effort, refusal fallback, web search) is implemented with the official SDK and tested against a scripted provider. **Not yet exercised with a live `ANTHROPIC_API_KEY`**, because none is configured on this machine
- ✅ Chat UI: streaming text, tool chips/cards, confirmation cards, drafts, sources, attachments, stop/retry, draft persistence
- 🟡 Voice: Android speech recognizer (dev build only; Expo Go shows an explanation), TTS with Hindi auto-detection, full-screen voice mode
- ✅ Conversation history (offline cache), rename, delete

## Phase 4: Tasks, calendar, reminders, notifications, notes
- ✅ Offline-first entities with outbox sync and LWW conflict handling (13 types)
- ✅ Tasks (priorities, recurrence with next instance, projects), calendar month view, events/birthdays, reminders
- 🟡 Local notifications for reminders, task/event alerts, bills and briefings (reconciled 14-day window); verify delivery on device
- ✅ Reschedule suggestions for missed tasks (server free-slot finder + offline fallback)
- 🟡 Phone calendar export/import with the SDK 57 class-based API (dev build)
- ✅ Notes with tags/pin/search, journal with mood

## Phase 5: Tools, memory, planning, confirmations
- ✅ 29 typed tools (no shell/SQL/eval), Zod validation, read/write/confirm permissions, read-after-write verification, audit log
- ✅ Pending actions: atomic claim, expiry, cross-user protection, results fed back to the model
- ✅ User-controlled memory (confirmation-gated saves, review/edit/delete/disable)
- ✅ Bounded multi-step plans (iteration cap), project breakdowns

## Phase 6: Research, wellness, finance, documents
- 🟡 Web research with sources (Claude web search, needs a key)
- ✅ Weather via Open-Meteo, with source and fetch time (verified live)
- ✅ Wellness metrics vs targets, habits with streaks, routines, AI meal/workout ideas with disclaimer
- ✅ Finance: transactions, budgets, bills/subscriptions with "mark paid", goals, monthly summary (server or on-device), CSV export
- 🟡 Documents & images: upload, PDF text extraction, AI summary and Q&A run without tools (summary/Q&A need a key), full-text knowledge search ✅
- ✅ Calculator and unit converter (offline), timer/stopwatch, camera document scan

## Phase 7: Android integrations, automations, offline, sync
- ✅ Automations: daily/weekly/manual triggers, template tokens, step history, cancel, retry with backoff, scheduler idempotency, suggestions from routines
- ✅ Offline banner, cached online data, drafts, honest offline states everywhere
- 🟡 Contacts picker for drafts, SMS/email/WhatsApp intents (user sends), location for weather
- 🟡 Push delivery of automation results (needs an EAS project id + FCM); otherwise in-app inbox ✅

## Phase 8: Testing, security, performance, release
- ✅ 130 automated tests: shared 34 · backend 37 (real PostgreSQL) · mobile 59
- ✅ `npm run check` (typecheck + lint + tests) green; `expo-doctor` 21/21; Android JS bundle export and native debug APK build (`gradlew assembleDebug`) succeed
- ✅ Security review items documented in [SECURITY.md](SECURITY.md); production Dockerfile, EAS profiles
- ⏳ End-to-end device tests (e.g. Maestro flows for onboarding, offline sync, reminders)
- ⏳ Play Store listing, privacy policy URL, Data safety form, release signing

## Planned (not built; the app does not claim these)
- ⏳ Wake word ("Hey Aura"): needs a foreground service and an on-device keyword model; constrained by Android background-mic rules
- ⏳ Location-based reminders (geofencing via expo-location + task manager)
- ⏳ Health Connect integration (steps, sleep) with explicit authorization
- ⏳ Receiving content from the Android share sheet
- ⏳ Password reset / email change / email verification (needs an email provider)
- ⏳ Offline upload queue for documents; voice-mode conversation continuity across sessions
- ⏳ Localized UI strings (assistant replies are already multilingual)
- ⏳ Bank/payment integrations: intentionally out of scope until separately authorized and security-reviewed
