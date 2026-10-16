import { formatMoney as formatMoneyShared, localDateKey } from '@aura/shared';

const LOCALE = 'en-IN';

export function formatTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' });
}

export function startOfLocalDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** "Today", "Tomorrow", "Yesterday", or "Mon, 20 Oct". */
export function relativeDay(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const diff = Math.round((startOfLocalDay(d).getTime() - startOfLocalDay().getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString(LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  });
}

export function formatDateTime(iso: string | Date): string {
  return `${relativeDay(iso)}, ${formatTime(iso)}`;
}

export function formatDate(iso: string | Date, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString(LOCALE, opts);
}

export function timeAgo(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  if (s < 7 * 86_400) return `${Math.round(s / 86_400)} d ago`;
  return formatDate(d, { day: 'numeric', month: 'short' });
}

export function isSameLocalDay(a: string | Date, b: string | Date = new Date()) {
  return localDateKey(new Date(a)) === localDateKey(new Date(b));
}

export function money(amountMinor: number, currency: string) {
  return formatMoneyShared(amountMinor, currency, LOCALE);
}

export function greeting(name?: string | null, d = new Date()) {
  const h = d.getHours();
  const part = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${name.split(' ')[0]}` : part;
}

export function pluralize(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export { localDateKey };
