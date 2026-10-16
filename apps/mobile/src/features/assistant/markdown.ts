/**
 * Tiny markdown subset for assistant replies: paragraphs, headings (rendered
 * bold), bullet and numbered lists, fenced code, and inline **bold**,
 * *italic*, `code`, [links](url) and bare URLs. No HTML, no images.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; url: string };

export type Block =
  | { type: 'paragraph'; content: Inline[] }
  | { type: 'heading'; content: Inline[] }
  | { type: 'bullet'; content: Inline[]; marker: string }
  | { type: 'code'; text: string };

const INLINE_RE = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))|(https?:\/\/[^\s)]+)|(\*([^*\s][^*]*)\*)|(_([^_\s][^_]*)_)/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const index = m.index ?? 0;
    if (index > last) out.push({ type: 'text', text: text.slice(last, index) });
    if (m[2] !== undefined) out.push({ type: 'bold', text: m[2] });
    else if (m[4] !== undefined) out.push({ type: 'code', text: m[4] });
    else if (m[6] !== undefined) out.push({ type: 'link', text: m[6], url: m[7]! });
    else if (m[8] !== undefined) out.push({ type: 'link', text: m[8], url: m[8] });
    else if (m[10] !== undefined) out.push({ type: 'italic', text: m[10] });
    else if (m[12] !== undefined) out.push({ type: 'italic', text: m[12] });
    last = index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];

  const flush = () => {
    if (para.length) {
      blocks.push({ type: 'paragraph', content: parseInline(para.join(' ')) });
      para = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*```/.test(line)) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i]!)) code.push(lines[i++]!);
      blocks.push({ type: 'code', text: code.join('\n') });
      continue;
    }
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', content: parseInline(heading[1]!.trim()) });
      continue;
    }
    const bullet = /^\s*([-*•])\s+(.*)$/.exec(line);
    const numbered = /^\s*(\d+[.)])\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flush();
      const m = (bullet ?? numbered)!;
      blocks.push({ type: 'bullet', marker: bullet ? '•' : m[1]!, content: parseInline(m[2]!.trim()) });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return blocks;
}

/** Plain text (for copying / speaking). */
export function markdownToPlain(src: string): string {
  return parseMarkdown(src)
    .map((b) => {
      if (b.type === 'code') return b.text;
      const t = b.content.map((i) => i.text).join('');
      return b.type === 'bullet' ? `${b.marker} ${t}` : t;
    })
    .join('\n');
}
