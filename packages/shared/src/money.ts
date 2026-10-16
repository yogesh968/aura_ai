/** Currencies with a non-standard number of minor units. */
const MINOR_DIGITS: Record<string, number> = {
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  BHD: 3,
  KWD: 3,
  OMR: 3,
  JOD: 3,
  TND: 3,
};

export function minorDigits(currency: string): number {
  return MINOR_DIGITS[currency.toUpperCase()] ?? 2;
}

export function toMinor(amount: number, currency: string): number {
  return Math.round(amount * 10 ** minorDigits(currency));
}

export function fromMinor(amountMinor: number, currency: string): number {
  return amountMinor / 10 ** minorDigits(currency);
}

export function formatMoney(amountMinor: number, currency: string, locale = 'en-IN'): string {
  const value = fromMinor(amountMinor, currency);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: minorDigits(currency),
      maximumFractionDigits: minorDigits(currency),
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(minorDigits(currency))}`;
  }
}

/** Parse user-entered money text ("1,250.50") into minor units, or null if invalid. */
export function parseMoneyInput(text: string, currency: string): number | null {
  const cleaned = text.replace(/[,\s]/g, '').replace(/^[^\d.]+/, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return toMinor(value, currency);
}

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Food & Dining',
  'Groceries',
  'Transport',
  'Shopping',
  'Bills & Utilities',
  'Rent',
  'Health',
  'Entertainment',
  'Education',
  'Travel',
  'Subscriptions',
  'Other',
] as const;

export const DEFAULT_INCOME_CATEGORIES = ['Salary', 'Freelance', 'Investments', 'Gifts', 'Refunds', 'Other'] as const;
