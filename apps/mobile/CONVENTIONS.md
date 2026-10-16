# AURA mobile — conventions

Expo SDK 57 · React Native 0.86 (New Architecture) · Expo Router 57 · TypeScript strict.
Read `AGENTS.md` (this folder) for Expo-specific rules: always `npx expo install`, never edit `android/`.

## Layout

```
src/app/                 routes only (Expo Router). (auth) = signed out, (app) = signed in.
src/app/(app)/(tabs)/    Home · Plan · Aura (assistant) · Life · More
src/components/ui/       design-system components (import from '@/components/ui')
src/features/<area>/     feature components, hooks and helpers (planner, assistant, life, workspace, account)
src/lib/                 data layer and platform services
src/theme/               tokens + ThemeProvider (useTheme)
```

## Route map (link targets are a contract — don't rename)

| Route | Screen |
|---|---|
| `/` `/plan` `/assistant` `/life` `/more` | tabs |
| `/task/[id]` `/event/[id]` `/reminder/[id]` | editors; `id = new` creates (optional query: `dueAt`, `startAt`, `remindAt`, `title`, `projectId`) |
| `/projects` `/projects/[id]` | projects |
| `/briefing?kind=morning\|evening` | briefing |
| `/chat/[id]` | chat (`new` creates; `?prompt=` pre-fills and sends) |
| `/voice` | full-screen voice assistant |
| `/actions` `/inbox` | pending confirmations · notifications inbox |
| `/habits/[id]` `/routines` `/routines/[id]` `/journal` `/wellness/[metric]` | life |
| `/finance` `/finance/transaction/[id]` `/finance/budgets` `/finance/bills` `/finance/bill/[id]` `/goals/[id]` | money & goals |
| `/notes` `/notes/[id]` `/documents` `/documents/[id]` `/search` | knowledge |
| `/tools` `/tools/{calculator,converter,translate,write,research,weather,timer,scan}` | utilities |
| `/automations` `/automations/[id]` `/automations/history` | automations |
| `/settings` `/settings/{assistant,memory,privacy,integrations,sync,account,server}` | settings |
| `/setup` | first-run personalization (signed in) |
| `/welcome` `/consent` `/sign-in` `/sign-up` | signed-out flow |

## Data rules

- **Syncable data** (tasks, events, reminders, notes, projects, habits, habit logs, wellness, transactions,
  budgets, bills, goals, routines): read with `useEntities(type)` / `useEntity(type, id)` from `@/lib/data`;
  write with `createEntity / updateEntity / deleteEntity / restoreEntity` from `@/lib/db/repo`.
  Writes are local-first, validated with the shared Zod schemas (`ValidationError.fields` for forms),
  and synced automatically. They work offline — never block them on the network.
- **Online-only data** (chat, memories, documents, automations, briefing, weather, AI tools): use
  `endpoints.*` from `@/lib/api/endpoints` via TanStack Query; use `useCachedQuery` where showing the last
  good copy offline is useful. Handle `NetworkError` (offline) and `ApiError` (`code === 'ai_unavailable'`)
  with `ErrorState`.
- Money is integer minor units (`amountMinor`); format with `money()` from `@/lib/format`.
- Never show success before the write/request actually succeeded. Toasts: `toast.success/error/info`.
- Destructive actions: confirm with `Alert.alert` (or offer Undo via `restoreEntity` + toast action).
- Preserve drafts of long text with `saveDraft/loadDraft` (`@/lib/db/database`).

## UI rules

- Every screen: `Screen` (+ `ScreenHeader` for pushed screens) and loading / empty / error / offline states.
- Only theme tokens (`useTheme()`), never hard-coded colors (gradients come from `colors.gradient`).
- Touch targets ≥ 48dp, `accessibilityLabel` on icon-only controls, `accessibilityRole` on custom pressables.
- No placeholder buttons: if a capability isn't available (e.g. needs the dev build), show why.
- Animations: `react-native-reanimated` entering/layout animations, short (150–300 ms).
- Tab screens pass `tabBarInset` to `Screen` so content clears the floating tab bar.
