import Storage from 'expo-sqlite/kv-store';
import { languageSchema, preferencesSchema, type Language, type Preferences } from '@aura/shared';
import { ApiError, isNetworkError } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import { useSettingsStore } from '@/lib/settings';

/** Pure helpers + persistence for user preferences (server is the source of truth, cached locally). */

export const LANGUAGE_OPTIONS: { value: Language; label: string; description?: string }[] = [
  { value: 'auto', label: 'Match my language', description: 'Replies in whatever language you use' },
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'हिन्दी (Hindi)' },
  { value: 'hinglish', label: 'Hinglish', description: 'Hindi in Roman script, mixed with English' },
  { value: 'bn', label: 'বাংলা (Bengali)' },
  { value: 'mr', label: 'मराठी (Marathi)' },
  { value: 'ta', label: 'தமிழ் (Tamil)' },
  { value: 'te', label: 'తెలుగు (Telugu)' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
];

export const TONE_OPTIONS: { value: Preferences['tone']; label: string; description: string }[] = [
  { value: 'friendly', label: 'Friendly', description: 'Warm and encouraging' },
  { value: 'concise', label: 'Concise', description: 'Short and to the point' },
  { value: 'professional', label: 'Professional', description: 'Polished and formal' },
  { value: 'playful', label: 'Playful', description: 'Light-hearted with a bit of fun' },
];

export function languageLabel(value: Language): string {
  return LANGUAGE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function isLanguage(v: string): v is Language {
  return languageSchema.safeParse(v).success;
}

/** "07:30" → Date today at 07:30 (local). */
export function timeToDate(hhmm: string, base = new Date()): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(base);
  d.setHours(Number.isFinite(h) ? h! : 0, Number.isFinite(m) ? m! : 0, 0, 0);
  return d;
}

/** Date → "HH:mm" (24h, zero-padded). */
export function dateToTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "07:30" → "7:30 AM" for display. */
export function formatHhmm(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function normalizeCurrency(code: string | null | undefined): string | null {
  const c = (code ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : null;
}

/** Deep-merge a patch into preferences the same way the server does. */
export function mergePreferences(current: Preferences, patch: Partial<Preferences>): Preferences {
  return {
    ...current,
    ...patch,
    voice: { ...current.voice, ...(patch.voice ?? {}) },
    briefings: { ...current.briefings, ...(patch.briefings ?? {}) },
    wellnessTargets: { ...current.wellnessTargets, ...(patch.wellnessTargets ?? {}) },
  };
}

/** Clamp a numeric stepper value to [min, max] rounded to `step`. */
export function stepValue(value: number, delta: number, min: number, max: number, step: number): number {
  const next = Math.round((value + delta) / step) * step;
  return Math.min(max, Math.max(min, Number(next.toFixed(4))));
}

const PENDING_KEY = 'aura.pendingPreferences';

export type SaveResult = 'saved' | 'queued';

/**
 * Optimistically apply a preferences patch locally, then persist on the server.
 * - Offline: the merged preferences are kept locally and queued; `flushPendingPreferences` retries.
 * - Server rejects: the local state is rolled back and the error is rethrown.
 */
export async function savePreferences(patch: Partial<Preferences>): Promise<SaveResult> {
  const store = useSettingsStore.getState();
  const previous = store.preferences;
  const next = mergePreferences(previous, patch);
  const check = preferencesSchema.safeParse(next);
  if (!check.success) throw new Error(check.error.issues[0]?.message ?? 'Invalid setting');
  store.setPreferences(next);
  try {
    const saved = await endpoints.preferences.update(patch);
    useSettingsStore.getState().setPreferences(saved);
    await clearPending();
    return 'saved';
  } catch (e) {
    if (isNetworkError(e)) {
      await queuePending(patch);
      return 'queued';
    }
    useSettingsStore.getState().setPreferences(previous);
    throw e;
  }
}

async function queuePending(patch: Partial<Preferences>) {
  const existing = await readPending();
  const merged = existing ? { ...existing, ...patch } : patch;
  // Nested objects: merge so successive offline edits are all kept.
  for (const k of ['voice', 'briefings', 'wellnessTargets'] as const) {
    if (existing?.[k] || patch[k]) (merged as Record<string, unknown>)[k] = { ...(existing?.[k] ?? {}), ...(patch[k] ?? {}) };
  }
  await Storage.setItem(PENDING_KEY, JSON.stringify(merged));
}

async function readPending(): Promise<Partial<Preferences> | null> {
  try {
    const raw = await Storage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as Partial<Preferences>) : null;
  } catch {
    return null;
  }
}

async function clearPending() {
  await Storage.removeItem(PENDING_KEY).catch(() => undefined);
}

export async function hasPendingPreferences(): Promise<boolean> {
  return (await readPending()) !== null;
}

/** Retry queued offline preference changes. Returns true if nothing is pending afterwards. */
export async function flushPendingPreferences(): Promise<boolean> {
  const pending = await readPending();
  if (!pending) return true;
  try {
    const saved = await endpoints.preferences.update(pending);
    useSettingsStore.getState().setPreferences(saved);
    await clearPending();
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.status < 500) await clearPending(); // invalid → drop
    return false;
  }
}
