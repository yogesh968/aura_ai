# Security & privacy

## Threat model (summary)

| Threat | Mitigation |
|---|---|
| Stolen device / tokens at rest | Tokens only in SecureStore (Android Keystore). 15-minute access tokens; refresh tokens rotate on every use and are stored server-side as SHA-256 hashes |
| Refresh-token theft & replay | Reusing a rotated token revokes **all** of that user's sessions |
| Credential stuffing / brute force | argon2id (OWASP parameters), generic "invalid email or password" message with timing equalized for unknown emails, 10 auth requests/min |
| Cross-user data access | Every query is scoped by the JWT's `sub`; other users' IDs return 404. Integration tests cover sync, memories, conversations and pending actions |
| Sync abuse (overwriting someone else's record by guessing its id) | Push checks ownership before any write and rejects foreign IDs |
| Prompt injection via documents, web pages, notes | Content is wrapped as `<untrusted_attachment>` / search results and labeled as data. Document summaries, Q&A and translation run with **no tools**. Consequential tools need explicit user confirmation through an authenticated request, which model output cannot produce |
| Runaway or unsafe agent behaviour | Typed tool catalog only (no shell/SQL/eval/HTTP), Zod validation, a maximum number of iterations per turn, no execution of truncated (`max_tokens`) or refused responses, read-back verification, audit log |
| Fake success | Tools report `succeeded` only after verifying the write. The UI shows results from the server or local DB, never optimistic claims about external actions |
| Messages, calls or payments without consent | AURA cannot send messages, call or pay. It only prepares drafts, and the user sends them from their own apps. Finance is manual bookkeeping |
| Secret leakage | AI keys live only in the backend `.env`. Logs redact `authorization`, cookies, passwords and refresh tokens; message contents are never logged |
| Rate-limit evasion with forged JWTs | The rate-limit key uses a *verified* token subject, falling back to the IP |
| Oversized payloads | Body limits per route (1 MB default, 5 MB sync push, ~11 MB document upload); PDFs are checked for the `%PDF-` magic number |
| Account deletion | `DELETE /v1/account` requires a typed confirmation and cascades every table; the app also wipes its local database |

## Privacy controls in the app

- **Consent screen** before sign-up explains what is stored and what is sent to the AI provider.
- **Memory**: memories the assistant proposes require confirmation. Users can view, edit and delete all
  memories, or turn memory off.
- **Export**: a full JSON export of all data, plus a CSV of transactions.
- **Permissions** are requested only when a feature needs them, each with an explanation and a link to
  system settings to revoke it. The Integrations screen shows what is granted.
- **Tool activity log**: Settings → Privacy shows everything the assistant or automations did.

## Production hardening checklist

- Serve the API over HTTPS only (behind a reverse proxy; set `NODE_ENV=production`, which enables `trustProxy` and
  requires an explicit `CORS_ORIGINS`).
- Use a managed PostgreSQL with encryption at rest and automated backups. Move document bytes to object
  storage (S3/GCS) with per-user prefixes if usage grows.
- Rotate `JWT_SECRET` and the AI key through your secret manager. Never commit `.env`.
- Run the rate limiter against a shared store (Redis) when running more than one instance, and run the
  automation scheduler on one instance only (claims are optimistic, so double ticks don't double-run).
- Add monitoring for 5xx responses, AI errors (`ai_*` codes) and the automation failure rate.
- Review Android release configuration: no cleartext traffic, R8/minify, and Play Data safety form answers
  that match this document.
