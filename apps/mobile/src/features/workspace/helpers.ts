import type { Note } from '@aura/shared';

// ---- JSON schema → simple form fields (automation step editor) -------------

export type FieldKind = 'string' | 'text' | 'number' | 'integer' | 'boolean' | 'enum' | 'datetime' | 'date' | 'stringList' | 'unsupported';

export interface FormField {
  key: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  options?: string[];
  description?: string;
}

type Schema = Record<string, unknown>;

function humanize(key: string) {
  const spaced = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Collapse nullable unions ({anyOf: [{type:'string'}, {type:'null'}]}) to the non-null member. */
function unwrap(s: Schema): Schema {
  const variants = (s.anyOf ?? s.oneOf) as Schema[] | undefined;
  if (Array.isArray(variants)) {
    const nonNull = variants.filter((v) => v.type !== 'null');
    if (nonNull.length === 1) return { ...nonNull[0], description: s.description ?? nonNull[0]!.description };
  }
  return s;
}

function kindOf(key: string, s: Schema): Pick<FormField, 'kind' | 'options'> {
  if (Array.isArray(s.enum)) return { kind: 'enum', options: (s.enum as unknown[]).map(String) };
  const type = Array.isArray(s.type) ? (s.type as string[]).find((t) => t !== 'null') : (s.type as string | undefined);
  switch (type) {
    case 'string':
      if (s.format === 'date-time') return { kind: 'datetime' };
      if (typeof s.pattern === 'string' && s.pattern.includes('\\d{4}-\\d{2}-\\d{2}') && !s.pattern.includes('T')) return { kind: 'date' };
      if (['content', 'body', 'notes', 'description'].includes(key) || (typeof s.maxLength === 'number' && s.maxLength > 1000)) return { kind: 'text' };
      return { kind: 'string' };
    case 'integer':
      return { kind: 'integer' };
    case 'number':
      return { kind: 'number' };
    case 'boolean':
      return { kind: 'boolean' };
    case 'array': {
      const items = (s.items ?? {}) as Schema;
      return items.type === 'string' ? { kind: 'stringList' } : { kind: 'unsupported' };
    }
    default:
      return { kind: 'unsupported' };
  }
}

export function schemaToFields(schema: Schema | null | undefined): FormField[] {
  if (!schema || typeof schema !== 'object') return [];
  const props = (schema.properties ?? {}) as Record<string, Schema>;
  const required = new Set((schema.required as string[] | undefined) ?? []);
  return Object.entries(props).map(([key, raw]) => {
    const s = unwrap(raw);
    return {
      key,
      label: humanize(key),
      required: required.has(key),
      description: typeof s.description === 'string' ? s.description : undefined,
      ...kindOf(key, s),
    };
  });
}

/** Convert raw text inputs into a typed step input object (empty optional fields omitted). */
export function buildStepInput(fields: FormField[], raw: Record<string, string | boolean | undefined>): { input: Record<string, unknown>; errors: Record<string, string> } {
  const input: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const v = raw[f.key];
    if (f.kind === 'boolean') {
      if (typeof v === 'boolean') input[f.key] = v;
      continue;
    }
    const text = typeof v === 'string' ? v.trim() : '';
    if (!text) {
      if (f.required) errors[f.key] = 'Required';
      continue;
    }
    if (f.kind === 'number' || f.kind === 'integer') {
      const n = Number(text);
      if (!Number.isFinite(n) || (f.kind === 'integer' && !Number.isInteger(n))) errors[f.key] = f.kind === 'integer' ? 'Whole number' : 'Number';
      else input[f.key] = n;
    } else if (f.kind === 'stringList') {
      input[f.key] = text.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (f.kind === 'enum' && f.options && !f.options.includes(text)) {
      errors[f.key] = `One of: ${f.options.join(', ')}`;
    } else {
      input[f.key] = text;
    }
  }
  return { input, errors };
}

/** Inverse of buildStepInput for editing an existing step. */
export function stepInputToRaw(input: Record<string, unknown>): Record<string, string | boolean> {
  const raw: Record<string, string | boolean> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'boolean') raw[k] = v;
    else if (Array.isArray(v)) raw[k] = v.join(', ');
    else if (v != null) raw[k] = String(v);
  }
  return raw;
}

export const TEMPLATE_TOKENS = ['{{today}}', '{{tomorrow}}', '{{now}}', '{{today@18:00}}', '{{tomorrow@09:30}}'];

// ---- Timer math -------------------------------------------------------------

export interface TimerState {
  /** Total countdown length in ms. */
  durationMs: number;
  /** Epoch ms when the current run started, or null when paused/stopped. */
  startedAt: number | null;
  /** Elapsed ms accumulated before the current run (pauses). */
  elapsedBefore: number;
}

export function timerElapsed(t: TimerState, now: number): number {
  return t.elapsedBefore + (t.startedAt != null ? Math.max(0, now - t.startedAt) : 0);
}

export function timerRemaining(t: TimerState, now: number): number {
  return Math.max(0, t.durationMs - timerElapsed(t, now));
}

export function formatDuration(ms: number, withTenths = false): string {
  const totalTenths = Math.floor(ms / 100);
  const totalSeconds = Math.floor(totalTenths / 10);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  const base = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  return withTenths ? `${base}.${totalTenths % 10}` : base;
}

// ---- Notes ------------------------------------------------------------------

/** Local note search: every query word must match title, content or tags; pinned first, then newest. */
export function searchNotes(notes: Note[], query: string, tag?: string | null): Note[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return notes
    .filter((n) => n.kind === 'note')
    .filter((n) => !tag || n.tags.includes(tag))
    .filter((n) => {
      if (words.length === 0) return true;
      const hay = `${n.title}\n${n.content}\n${n.tags.join(' ')}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => (a.pinned === b.pinned ? b.updatedAt.localeCompare(a.updatedAt) : a.pinned ? -1 : 1));
}

export function noteTitle(n: Pick<Note, 'title' | 'content'>): string {
  return n.title.trim() || n.content.trim().split('\n')[0]?.slice(0, 60) || 'Untitled note';
}

export function allTags(notes: Note[]): string[] {
  return [...new Set(notes.filter((n) => n.kind === 'note').flatMap((n) => n.tags))].sort((a, b) => a.localeCompare(b));
}

export function parseTags(text: string): string[] {
  return [...new Set(text.split(/[,#]/).map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20).map((t) => t.slice(0, 40));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
