# AGENTS.md — working on AURA

Guidance for human contributors and AI coding agents. Also read `apps/mobile/AGENTS.md` (Expo rules)
and `apps/mobile/CONVENTIONS.md` (mobile structure and data rules).

## Repository map

```
packages/shared   single source of truth: Zod schemas, tool catalog, pure utilities (no I/O)
apps/backend      Fastify API, Prisma/PostgreSQL, agent loop, tools, sync, automations
apps/mobile       Expo app (Expo Router, offline SQLite store, sync engine, UI kit)
docs/             PRD, architecture, schema, API, security, testing, checklist
```

## Golden rules

1. **Contracts live in `packages/shared`.** Change an entity, DTO or tool there first, run
   `npm run build:shared`, then update the backend and mobile. Never duplicate a schema.
2. **No fake success.** Report success only after the write or request has actually happened (server: tools
   read back what they wrote; mobile: show success after the local write or API call resolves).
3. **No unrestricted execution.** Tools are typed, Zod-validated and permission-classed (`read` / `write` /
   `confirm`). Never add shell, eval, SQL or generic HTTP tools. `confirm` tools must stay non-automatable.
4. **Secrets stay on the server.** No API keys in the app; never log tokens, passwords or message content.
5. **Ownership everywhere.** Every query on user data is scoped by `userId`. Add an isolation test for new endpoints.
6. **Append-only AI history.** The system prompt (`SYSTEM_PROMPT`) and the tool set are frozen per conversation.
   Per-turn data goes into the `<context>` block of the new user turn. Never edit or delete stored
   `apiMessages`, because prompt caching and preserved thinking depend on byte-identical history.
7. **Untrusted content is data.** Document/web/note text is wrapped and labeled. Features that process it
   (summaries, Q&A, translation) run with **no tools**.
8. **Offline first on mobile.** Syncable entities are written to SQLite and the outbox, never awaited on the
   network. Online-only features must handle `NetworkError` and `ai_unavailable` explicitly.

## Coding conventions

- TypeScript strict everywhere; no `any` in new code (use `unknown` + Zod).
- Backend: services hold logic, routes only parse (`parse(schema, input)`) and delegate; errors are
  `AppError` (`badRequest`, `notFound`, …) and serialized as `{ error: { code, message, details? } }`.
- Prisma migrations: add SQL under `apps/backend/prisma/migrations/<timestamp>_<name>/` and apply with
  `npm run db:migrate` (`migrate deploy`). The init migration contains hand-written SQL (sync sequence,
  triggers, full-text indexes), so `prisma migrate dev` reports drift. Write migrations by hand or with
  `prisma migrate diff`, then review them.
- Mobile: routes in `src/app`, features in `src/features/<area>`, design system in `src/components/ui`;
  theme tokens only; accessibility labels on icon buttons; loading/empty/error/offline states on every screen.
- Comments explain *why*, not *what*. Match the surrounding style.

## Adding a tool for the assistant

1. Declare it in `packages/shared/src/tools.ts` (name, label, description, category, permission, automatable, Zod input).
2. Implement the handler in `apps/backend/src/modules/agent/tools.ts`. Validate, scope to `ctx.userId`,
   read back after writes, and return a human `summary` plus a model-facing `modelResult`.
3. For `confirm` tools, add a description case in `ToolExecutor.describe`.
4. Add tests in `apps/backend/test/agent.test.ts` (happy path, invalid input, isolation, confirmation if relevant).
5. If the result needs UI, add a `display` payload and render it in the mobile chat tool cards.

## Before you finish

```bash
npm run typecheck && npm run lint && npm test
```
The backend tests start their own embedded PostgreSQL on port 5434 and create a uniquely named database
per run, so they never touch your dev data.
