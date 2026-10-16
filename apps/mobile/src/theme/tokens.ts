/**
 * AURA design tokens. Every color, size and radius in the app comes from here.
 * Color pairs were chosen for WCAG AA contrast (≥ 4.5:1 for body text on
 * `bg`/`surface`, ≥ 3:1 for large text and icons).
 */

export const palette = {
  violet50: '#F3F0FF',
  violet100: '#E7E0FF',
  violet300: '#B6A4FF',
  violet400: '#9B83FF',
  violet500: '#7C5CFF',
  violet600: '#6541F0',
  violet700: '#5130C8',
  cyan400: '#22D3EE',
  cyan600: '#0891B2',
  green500: '#22C55E',
  green600: '#16A34A',
  amber500: '#F59E0B',
  amber600: '#D97706',
  red500: '#EF4444',
  red600: '#DC2626',
  pink500: '#EC4899',
  blue500: '#3B82F6',
  ink950: '#07070F',
  ink900: '#0B0B14',
  ink850: '#11111F',
  ink800: '#15152A',
  ink750: '#1D1D36',
  ink700: '#2A2A45',
  ink500: '#5B5B72',
  ink400: '#8A8AA3',
  ink300: '#A0A0B8',
  ink200: '#D6D6E4',
  ink100: '#E4E4EE',
  ink50: '#F7F7FB',
  white: '#FFFFFF',
} as const;

export interface ColorScheme {
  bg: string;
  surface: string;
  surfaceAlt: string;
  surfacePressed: string;
  border: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  textInverse: string;
  primary: string;
  primaryPressed: string;
  primaryText: string;
  primarySoft: string;
  accent: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  overlay: string;
  gradient: [string, string, string];
  priority: Record<'low' | 'medium' | 'high' | 'urgent', string>;
  categorical: string[];
}

export const lightColors: ColorScheme = {
  bg: palette.ink50,
  surface: palette.white,
  surfaceAlt: '#F0F0F7',
  surfacePressed: '#E9E9F3',
  border: palette.ink100,
  text: '#0E0E1A',
  textMuted: palette.ink500,
  textSubtle: '#6E6E86',
  textInverse: palette.white,
  primary: palette.violet600,
  primaryPressed: palette.violet700,
  primaryText: palette.white,
  primarySoft: palette.violet50,
  accent: palette.cyan600,
  success: palette.green600,
  successSoft: '#E8F8EE',
  warning: palette.amber600,
  warningSoft: '#FEF4E2',
  danger: palette.red600,
  dangerSoft: '#FDECEC',
  info: palette.blue500,
  overlay: 'rgba(7,7,15,0.45)',
  gradient: [palette.violet600, '#8B5CF6', palette.cyan600],
  priority: { low: '#64748B', medium: palette.blue500, high: palette.amber600, urgent: palette.red600 },
  categorical: [palette.violet600, palette.cyan600, palette.amber600, palette.green600, palette.pink500, palette.blue500, '#A16207', '#0F766E'],
};

export const darkColors: ColorScheme = {
  bg: palette.ink900,
  surface: palette.ink800,
  surfaceAlt: palette.ink750,
  surfacePressed: '#24243F',
  border: palette.ink700,
  text: '#F4F4FA',
  textMuted: palette.ink300,
  textSubtle: palette.ink400,
  textInverse: palette.ink900,
  primary: palette.violet400,
  primaryPressed: palette.violet500,
  primaryText: palette.ink950,
  primarySoft: '#221B47',
  accent: palette.cyan400,
  success: '#4ADE80',
  successSoft: '#11291C',
  warning: '#FBBF24',
  warningSoft: '#2D230C',
  danger: '#F87171',
  dangerSoft: '#2E1416',
  info: '#60A5FA',
  overlay: 'rgba(0,0,0,0.6)',
  gradient: [palette.violet500, '#A78BFA', palette.cyan400],
  priority: { low: '#94A3B8', medium: '#60A5FA', high: '#FBBF24', urgent: '#F87171' },
  categorical: ['#A78BFA', '#22D3EE', '#FBBF24', '#4ADE80', '#F472B6', '#60A5FA', '#FCD34D', '#2DD4BF'],
};

/** 4-pt spacing scale. */
export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '800' as const, letterSpacing: -0.5 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700' as const, letterSpacing: -0.3 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '700' as const },
  subheading: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' as const },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: '600' as const },
  caption: { fontSize: 14, lineHeight: 19, fontWeight: '400' as const },
  small: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const, letterSpacing: 0.2 },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '700' as const, letterSpacing: 1, textTransform: 'uppercase' as const },
} as const;

export type TypographyVariant = keyof typeof typography;

export const elevation = {
  card: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  raised: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
} as const;

/** Minimum touch target (Android guidelines: 48dp). */
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;
export const MIN_TOUCH = 48;
