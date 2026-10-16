import { Prisma, type PrismaClient } from '@prisma/client';
import type { KnowledgeSearchResult } from '@aura/shared';

/**
 * Personal knowledge base search over notes, documents and memories using
 * PostgreSQL full-text search ('simple' config so Hindi/Hinglish words are
 * kept as-is), with a substring fallback for partial words.
 */
export class KnowledgeService {
  constructor(private readonly prisma: PrismaClient) {}

  async search(userId: string, query: string, limit = 10): Promise<KnowledgeSearchResult[]> {
    const q = query.trim().slice(0, 200);
    if (!q) return [];
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const take = Math.min(Math.max(limit, 1), 20);

    const rows = await this.prisma.$queryRaw<
      { kind: 'note' | 'document' | 'memory'; id: string; title: string; snippet: string; rank: number }[]
    >(Prisma.sql`
      WITH q AS (SELECT websearch_to_tsquery('simple', ${q}) AS tsq)
      SELECT * FROM (
        SELECT 'note' AS kind, n.id::text AS id,
               CASE WHEN n.title = '' THEN left(n.content, 60) ELSE n.title END AS title,
               ts_headline('simple', n.content, q.tsq, 'MaxWords=30, MinWords=10, StartSel=«, StopSel=»') AS snippet,
               (ts_rank(to_tsvector('simple', coalesce(n.title,'') || ' ' || coalesce(n.content,'')), q.tsq)
                 + CASE WHEN n.title ILIKE ${like} THEN 0.5 ELSE 0 END)::float AS rank
        FROM notes n, q
        WHERE n."userId" = ${userId}::uuid AND n."deletedAt" IS NULL
          AND (to_tsvector('simple', coalesce(n.title,'') || ' ' || coalesce(n.content,'')) @@ q.tsq
               OR n.title ILIKE ${like} OR n.content ILIKE ${like})
        UNION ALL
        SELECT 'document', d.id::text, d.name,
               ts_headline('simple', coalesce(d.summary, '') || ' ' || coalesce(left(d.text, 20000), ''), q.tsq,
                           'MaxWords=30, MinWords=10, StartSel=«, StopSel=»'),
               (ts_rank(to_tsvector('simple', coalesce(d.name,'') || ' ' || coalesce(d.text,'') || ' ' || coalesce(d.summary,'')), q.tsq)
                 + CASE WHEN d.name ILIKE ${like} THEN 0.5 ELSE 0 END)::float
        FROM documents d, q
        WHERE d."userId" = ${userId}::uuid
          AND (to_tsvector('simple', coalesce(d.name,'') || ' ' || coalesce(d.text,'') || ' ' || coalesce(d.summary,'')) @@ q.tsq
               OR d.name ILIKE ${like})
        UNION ALL
        SELECT 'memory', m.id::text, 'Memory', m.content,
               (ts_rank(to_tsvector('simple', m.content), q.tsq) + 0.1)::float
        FROM memories m, q
        WHERE m."userId" = ${userId}::uuid
          AND (to_tsvector('simple', m.content) @@ q.tsq OR m.content ILIKE ${like})
      ) results
      ORDER BY rank DESC
      LIMIT ${take}
    `);
    return rows.map((r) => ({ ...r, rank: Number(r.rank) }));
  }
}
