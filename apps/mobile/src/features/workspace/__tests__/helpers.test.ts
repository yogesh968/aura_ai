import { buildEntity, type Note } from '@aura/shared';
import {
  allTags,
  buildStepInput,
  formatDuration,
  noteTitle,
  parseTags,
  schemaToFields,
  searchNotes,
  stepInputToRaw,
  timerRemaining,
} from '../helpers';
import { weatherIcon } from '../weather';

describe('schemaToFields', () => {
  const schema = {
    type: 'object',
    properties: {
      title: { type: 'string', minLength: 1 },
      body: { type: 'string', maxLength: 500 },
      priority: { type: 'string', enum: ['low', 'medium', 'high'] },
      dueAt: { type: 'string', format: 'date-time' },
      date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      estimateMinutes: { type: 'integer' },
      amount: { type: 'number' },
      includePast: { type: 'boolean' },
      tags: { type: 'array', items: { type: 'string' } },
      remindAt: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
    },
    required: ['title'],
  };

  it('derives field kinds, labels and required flags', () => {
    const fields = schemaToFields(schema);
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
    expect(byKey.title).toMatchObject({ kind: 'string', required: true, label: 'Title' });
    expect(byKey.body!.kind).toBe('text');
    expect(byKey.priority).toMatchObject({ kind: 'enum', options: ['low', 'medium', 'high'] });
    expect(byKey.dueAt!.kind).toBe('datetime');
    expect(byKey.date!.kind).toBe('date');
    expect(byKey.estimateMinutes).toMatchObject({ kind: 'integer', label: 'Estimate Minutes' });
    expect(byKey.amount!.kind).toBe('number');
    expect(byKey.includePast!.kind).toBe('boolean');
    expect(byKey.tags!.kind).toBe('stringList');
    expect(byKey.remindAt!.kind).toBe('datetime');
  });

  it('handles empty schemas', () => {
    expect(schemaToFields({ type: 'object', properties: {} })).toEqual([]);
    expect(schemaToFields(null)).toEqual([]);
  });

  it('builds typed inputs and reports errors', () => {
    const fields = schemaToFields(schema);
    const ok = buildStepInput(fields, { title: ' Plan ', estimateMinutes: '30', amount: '12.5', tags: 'a, b', includePast: true, dueAt: '{{today@18:00}}' });
    expect(ok.errors).toEqual({});
    expect(ok.input).toEqual({ title: 'Plan', estimateMinutes: 30, amount: 12.5, tags: ['a', 'b'], includePast: true, dueAt: '{{today@18:00}}' });

    const bad = buildStepInput(fields, { estimateMinutes: '2.5', priority: 'galactic' });
    expect(bad.errors).toMatchObject({ title: 'Required', estimateMinutes: 'Whole number' });
    expect(bad.errors.priority).toContain('One of');
  });

  it('round-trips step inputs for editing', () => {
    expect(stepInputToRaw({ title: 'x', tags: ['a', 'b'], n: 3, flag: false })).toEqual({ title: 'x', tags: 'a, b', n: '3', flag: false });
  });
});

describe('timer math', () => {
  it('computes remaining time from timestamps across pauses', () => {
    const t = { durationMs: 60_000, startedAt: 1_000, elapsedBefore: 10_000 };
    expect(timerRemaining(t, 21_000)).toBe(30_000);
    expect(timerRemaining(t, 1_000_000)).toBe(0);
    expect(timerRemaining({ ...t, startedAt: null }, 99_999)).toBe(50_000);
  });
  it('formats durations', () => {
    expect(formatDuration(65_000)).toBe('01:05');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
    expect(formatDuration(1_250, true)).toBe('00:01.2');
  });
});

describe('local note search', () => {
  const mk = (title: string, content: string, extra: Partial<Note> = {}) =>
    ({ ...buildEntity('note', `00000000-0000-4000-8000-${String(Math.random()).slice(2, 14).padEnd(12, '0')}`, { title, content }), ...extra }) as Note;
  const notes = [
    mk('Goa trip', 'Book train tickets', { tags: ['travel'], updatedAt: '2026-10-01T00:00:00.000Z' }),
    mk('Groceries', 'milk, eggs, bread', { pinned: true, updatedAt: '2026-09-01T00:00:00.000Z' }),
    mk('', 'Journal entry', { kind: 'journal' }),
    mk('Books', 'Deep Work', { tags: ['reading', 'travel'], updatedAt: '2026-10-05T00:00:00.000Z' }),
  ];

  it('filters by all words across title, content and tags, excluding journal entries', () => {
    expect(searchNotes(notes, 'train book').map((n) => n.title)).toEqual(['Goa trip']);
    expect(searchNotes(notes, 'journal')).toEqual([]);
    expect(searchNotes(notes, 'TRAVEL').map((n) => n.title)).toEqual(['Books', 'Goa trip']);
  });

  it('sorts pinned first then newest, and filters by tag', () => {
    expect(searchNotes(notes, '').map((n) => n.title)).toEqual(['Groceries', 'Books', 'Goa trip']);
    expect(searchNotes(notes, '', 'reading').map((n) => n.title)).toEqual(['Books']);
    expect(allTags(notes)).toEqual(['reading', 'travel']);
  });

  it('derives titles and parses tags', () => {
    expect(noteTitle({ title: '', content: 'First line\nsecond' })).toBe('First line');
    expect(noteTitle({ title: '  ', content: '' })).toBe('Untitled note');
    expect(parseTags('#Work, ideas, work')).toEqual(['work', 'ideas']);
  });
});

describe('weatherIcon', () => {
  it('maps rain showers (80-82) to rain, not snow', () => {
    expect(weatherIcon(80)).toBe('rainy-outline');
    expect(weatherIcon(81)).toBe('rainy-outline');
    expect(weatherIcon(82)).toBe('rainy-outline');
  });

  it('maps snow codes to snow', () => {
    for (const code of [71, 73, 75, 77, 85, 86]) expect(weatherIcon(code)).toBe('snow-outline');
  });

  it('covers clear, cloud, drizzle and storms', () => {
    expect(weatherIcon(0)).toBe('sunny-outline');
    expect(weatherIcon(3)).toBe('cloudy-outline');
    expect(weatherIcon(61)).toBe('rainy-outline');
    expect(weatherIcon(95)).toBe('thunderstorm-outline');
    expect(weatherIcon(-1)).toBe('cloud-outline');
  });
});
