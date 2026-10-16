# AURA AI — personal AI assistant for Android

AURA helps one person run their day: planning, tasks, reminders, calendar, notes, habits and wellness,
money tracking, research, writing and everyday utilities. You can talk to it in English, हिन्दी or
Hinglish, by text or by voice. AURA does more than chat: it uses typed tools to change your data
(always validated and permission-checked), asks before doing anything consequential, and never claims
an action succeeded unless it actually did.

| Part | Stack |
|---|---|
| `apps/mobile` | Expo SDK 57 · React Native 0.86 (New Architecture) · Expo Router · TypeScript · Zustand · TanStack Query · expo-sqlite (offline store) · SecureStore |
| `apps/backend` | Node.js · Fastify 5 · TypeScript · Prisma 6 · PostgreSQL · Claude (Anthropic SDK) |
| `packages/shared` | Zod schemas (entities, API DTOs, tool catalog), date/recurrence/money utilities, offline NLP quick-add, calculator, unit converter |
| `docs/` | PRD, architecture (Mermaid), database schema, API reference, security, testing, checklist |

## Quick start (Windows/macOS/Linux)

Requirements: **Node.js ≥ 20.19** (tested with Node 24) and npm 10+. You **don't** need Docker or a PostgreSQL
install for development, because the backend ships an embedded PostgreSQL. To run on a phone you need
Android Studio (an emulator) or a physical Android device; see [Mobile](#mobile).

```bash
# 1. Install everything (also builds packages/shared and generates the Prisma client)
npm install

# 2. Configure the backend
cp apps/backend/.env.example apps/backend/.env
#    then set JWT_SECRET (a long random string) and, for AI features, ANTHROPIC_API_KEY

# 3. Start a local PostgreSQL (keep this terminal open; data lives in apps/backend/.pgdata)
npm run db:start

# 4. In a second terminal: create the schema and load demo data
npm run db:migrate
npm run db:seed            # demo account: demo@aura.app / aura-demo-1234

# 5. Run the API (http://localhost:4000, health check at /health)
npm run dev:backend

# 6. In a third terminal: run the app (see "Mobile" for device setup)
npm run dev:mobile
```

### Configuration

All server secrets stay on the backend. The mobile app never contains an API key.

| Variable (`apps/backend/.env`) | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | ≥ 32 random characters; signs 15-minute access tokens |
| `AI_PROVIDER` | `anthropic` (Claude) or `none` |
| `ANTHROPIC_API_KEY` | Enables chat, voice replies, briefings' AI summary, document understanding, web research, translation and writing help |
| `AI_MODEL` | Defaults to `claude-opus-5-5` |
| `AI_EFFORT` | `low` / `medium` / `high` reasoning effort for chat turns (default `low`, for snappy replies) |
| `WEATHER_ENABLED` | Live weather from Open-Meteo (no key needed) |
| `EXPO_PUSH_ENABLED`, `EXPO_ACCESS_TOKEN` | Optional push delivery of automation results (requires an EAS project) |

**Without an AI key**, everything that doesn't need AI keeps working: tasks, calendar, reminders and
notifications, notes, habits, wellness, finance, routines, offline quick-add, calculator, unit
converter, weather, sync, export and automations. AI screens say plainly that AI isn't configured;
they never pretend.

## Mobile

```bash
cd apps/mobile
# Optional: point the app at your backend (the Android emulator default is http://10.0.2.2:4000)
echo EXPO_PUBLIC_API_URL=http://<your-computer-LAN-IP>:4000 > .env

npx expo run:android      # builds and installs the development build (recommended)
# or
npx expo start            # then press "a"; Expo Go works for most screens, see below
```

AURA uses native modules that **Expo Go does not include**: speech recognition (voice input), phone-calendar
access and push notifications. Use the development build (`npx expo run:android`, or
`npx eas-cli build --profile development`) for the full experience. In Expo Go those features show an
explanation instead of failing silently. The server URL can also be changed in the app (Settings → Server).

Building locally requires Android Studio's JDK 17+ (`JAVA_HOME`) and the Android SDK (`ANDROID_HOME`).

## Commands

| Command (from the repo root) | What it does |
|---|---|
| `npm run typecheck` | TypeScript in all workspaces |
| `npm run lint` | ESLint in all workspaces |
| `npm test` | Shared unit tests, backend integration tests (against a throwaway embedded PostgreSQL) and mobile tests |
| `npm run check` | All of the above |
| `npm run db:start` / `db:migrate` / `db:seed` | Local database lifecycle |

## Documentation

- [Product requirements (PRD)](docs/PRD.md)
- [Architecture & AI execution flow](docs/ARCHITECTURE.md) (Mermaid diagrams)
- [Database schema](docs/DATABASE.md)
- [API reference](docs/API.md)
- [Security & privacy](docs/SECURITY.md)
- [Testing](docs/TESTING.md)
- [Implementation checklist & roadmap](docs/CHECKLIST.md)
- [Contributor & agent guide](AGENTS.md), [mobile conventions](apps/mobile/CONVENTIONS.md)
