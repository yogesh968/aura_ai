# AURA AI — Product requirements

## Vision

A trustworthy, all-in-one personal assistant for Android that helps a person run their whole day, from
the morning briefing to planning tomorrow. It understands natural requests in English, Hindi and
Hinglish, remembers what the user approves, organizes information, and takes useful actions, always
with the user in control.

## Principles

1. **Useful, not just chatty**: requests become real tasks, reminders, events, notes and records.
2. **Honest**: never fabricate live information, never claim an action succeeded unless it did, and
   say clearly what is unavailable.
3. **In control**: consequential actions need confirmation; memory is visible and editable; data can be
   exported and deleted.
4. **Works offline**: core organization features never depend on connectivity.
5. **Respects Android**: asks for permissions only when needed and explains why. It does not claim to control
   other apps or read private data that Android doesn't allow.

## Personas

- **Asha, 29, freelance designer in Pune.** Juggles client deadlines, wants reminders in Hinglish by voice, and
  tracks spending informally.
- **Rahul, 41, manager.** Lives in his calendar, wants a morning briefing, email drafts and a weekly money check.
- **Meera, 23, student.** Builds study and fitness habits, journals, and asks research questions with sources.

## Scope (v1)

| Area | Capabilities |
|---|---|
| AI brain & voice | Streaming chat with tool use; voice input (on-device recognizer) and spoken replies with listen/speak/stop/retry; conversation history; user-approved memory; multi-step bounded plans; confirmation cards |
| Daily life | Tasks (priorities, due dates, recurrence, projects), calendar events and birthdays, reminders, offline quick-add NLP ("remind me tomorrow at 9", Hinglish), morning/evening briefings, reschedule suggestions for missed tasks, local notifications |
| Productivity | Notes, journal, documents and images (summaries, Q&A), full-text knowledge search, writing help (email/message/rewrite/code), translation, web research with sources, project breakdowns |
| Wellness | Water, sleep, exercise, steps, weight, mood; habits with streaks; routines; meal and workout ideas (general guidance with disclaimers) |
| Finance | Income/expenses, categories, budgets, bills and subscriptions with reminders, goals, monthly summary, CSV export. Manual tracking only |
| Utilities | Calculator, unit converter (both offline), weather (Open-Meteo), timer/stopwatch, document scan via camera |
| Personalization & automation | Assistant name, language, tone, voice, theme; briefing times; automations with schedules, step history, retries and cancellation; suggestions from the user's routines |
| Android integrations | Notifications, phone calendar export/import (opt-in), contact picker for drafts, SMS/email/WhatsApp intents for drafts the user sends, location for weather |
| Account & privacy | Email account or guest (upgradeable), consent, memory management, export, delete account, tool activity log, sync status |

### Out of scope for v1 (planned)

Wake word, location-triggered reminders (geofencing), health-platform integrations (Health Connect), bank
or payment integrations, receiving content from the Android share sheet, push notifications without EAS,
and multi-device real-time collaboration. See [CHECKLIST.md](CHECKLIST.md).

## Key user journeys

1. **"Remind me tomorrow at 9 AM to call mom."** Voice or text creates a reminder (via the agent online, or via
   offline quick-add) and a local notification fires at 9:00 even if the phone is offline.
2. **"Plan my day."** The agent reads the agenda, proposes a schedule, creates tasks with times, and explains
   what it created.
3. **Missed tasks** show "Reschedule missed": the user picks suggested free slots in one tap.
4. **"Delete my old tasks."** A confirmation card appears and nothing is deleted until the user confirms.
5. **A morning notification** opens the briefing: schedule, tasks, bills due, weather (with source), and a
   short AI summary built only from those facts.
6. **A document** is uploaded and summarized. Its text becomes searchable, and the user asks questions about it.

## Non-functional requirements

- **Performance**: local reads < 50 ms; first streamed AI token typically < 3 s with `AI_EFFORT=low`.
- **Reliability**: sync is idempotent and resumable; chat retries are idempotent (`clientMessageId`).
- **Security**: see [SECURITY.md](SECURITY.md).
- **Accessibility**: 48dp targets, screen-reader labels, dynamic type up to 1.6×, AA contrast in both themes.
- **Localization**: the assistant speaks the user's language; UI copy is English in v1 (strings centralized per feature).

## Success metrics

Day-7 retention; reminders created per active user; percentage of assistant actions confirmed vs cancelled;
sync conflict rate < 0.5%; crash-free sessions > 99.5%.
