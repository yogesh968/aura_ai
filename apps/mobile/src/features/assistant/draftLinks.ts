/** Deep links that open a prepared draft in the user's own apps. The user always sends it. */

const enc = encodeURIComponent;

export function cleanPhone(raw: string): string {
  return raw.replace(/[^\d+]/g, '');
}

export function smsUrl(body: string, phone?: string | null): string {
  const to = phone ? cleanPhone(phone) : '';
  return `sms:${to}?body=${enc(body)}`;
}

export function isEmail(value?: string | null): value is string {
  return !!value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function mailtoUrl(body: string, opts: { to?: string | null; subject?: string | null } = {}): string {
  const to = isEmail(opts.to) ? enc(opts.to.trim()) : '';
  const params = [opts.subject ? `subject=${enc(opts.subject)}` : null, `body=${enc(body)}`].filter(Boolean).join('&');
  return `mailto:${to}?${params}`;
}

export function whatsappUrls(body: string, phone?: string | null): { app: string; web: string } {
  const digits = phone ? cleanPhone(phone).replace(/^\+/, '') : '';
  return {
    app: `whatsapp://send?${digits ? `phone=${digits}&` : ''}text=${enc(body)}`,
    web: `https://wa.me/${digits}?text=${enc(body)}`,
  };
}
