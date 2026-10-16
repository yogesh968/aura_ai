# Testing

```bash
npm test                         # everything
npm test -w @aura/shared         # pure logic (Jest + SWC)
npm test -w @aura/backend        # API integration tests against real PostgreSQL
npm test -w @aura/mobile         # jest-expo + React Native Testing Library
npm run typecheck && npm run lint
```

## Backend integration tests

- `test/global-setup.ts` starts a **test-only embedded PostgreSQL on port 5434** (data in `apps/backend/.pgdata-test`),
  creates a uniquely named database for the run, and applies migrations with `prisma migrate deploy`.
  Teardown drops only that run's database. Dev data on port 5433 is never touched.
- Tests drive the real Fastify app through `app.inject` (no network), including SSE chat streams.
- The LLM is replaced by `ScriptedAi` (`test/helpers.ts`), which returns scripted responses and records every
  request, so tests can assert on exactly what would be sent to Claude.

| Suite | Covers |
|---|---|
| `auth.test.ts` | registration, generic login errors, hashing, refresh rotation and reuse revocation, guest → account upgrade, account deletion, preference validation |
| `sync.test.ts` | push/pull by cursor, version bumps, last-writer-wins conflicts both ways, tombstones, cross-user isolation, invalid records, bigint money |
| `agent.test.ts` | "remind me tomorrow at 9" end to end, confirmation gating (no execution before confirm, other users can't confirm, no double execution), rejections, **append-only replay with a frozen system prompt and tools**, invalid/unknown tool calls, iteration bound, refusal and `max_tokens` handling, provider errors, idempotent retries, AI-unavailable 503 |
| `features.test.ts` | agenda with recurrence, reschedule suggestions, finance summary + CSV, full-text search isolation, file-type validation, weather (mocked fetch), automation scheduling/templates/validation/runs/retry/scheduler idempotency/suggestions, briefing, memory isolation |

## Manual test plan (device)

1. **Onboarding**: welcome → consent (can't continue without agreeing) → sign up → setup (language, briefings,
   notification permission) → Home.
2. **Offline**: enable airplane mode, then add a task, a note, an expense and a water log. Each saves instantly and
   the offline banner shows. Turn networking back on: Settings → Sync shows pending → 0.
3. **Reminders**: quick-add "Remind me in 2 minutes to stretch" (offline NLP), lock the phone, and check the
   notification arrives. Tapping it opens the reminder.
4. **Assistant** (needs `ANTHROPIC_API_KEY`): "Remind me tomorrow at 9 AM to call mom" creates a reminder card;
   "Delete that reminder" shows a confirmation card, and Cancel leaves it in place; "What's the weather in Pune?"
   shows Open-Meteo as the source; "Draft a WhatsApp to Rohan saying I'm late" shows a draft card that opens WhatsApp.
5. **Voice** (development build): long-press the orb, say "Kal subah 9 baje doctor ko call karna yaad dilana", and
   hear the spoken reply. Stop and Retry work.
6. **Documents**: upload a PDF, summarize it, ask a question, then search for a word from it in Search.
7. **Automations**: add the "Morning briefing" suggestion, Run now, and check the history shows the step results.
8. **Privacy**: export data, delete one memory, and sign out (warned if changes are unsynced).
