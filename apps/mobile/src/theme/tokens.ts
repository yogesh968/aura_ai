/**
 * AURA design tokens (Apple Human Interface style). Every color, size and radius in the app comes from here.
 * Color pairs were chosen for WCAG AA contrast (≥ 4.5:1 for body text on
 * `bg`/`surface`, ≥ 3:1 for large text and icons).
 */

export const palette = {
  // Apple system colors (light / dark variants from the Human Interface Guidelines).
  blue: '#007AFF',
  blueDark: '#0A84FF',
  indigo: '#5856D6',
  indigoDark: '#5E5CE6',
  purple: '#AF52DE',
  purpleDark: '#BF5AF2',
  teal: '#30B0C7',
  tealDark: '#40C8E0',
  green: '#34C759',
  greenDark: '#30D158',
  orange: '#FF9500',
  orangeDark: '#FF9F0A',
  red: '#FF3B30',
  redDark: '#FF453A',
  pink: '#FF2D55',
  pinkDark: '#FF375F',
  yellow: '#FFCC00',
  gray: '#8E8E93',
  black: '#000000',
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

/*
 * Apple-style schemes: grouped backgrounds (systemGroupedBackground) with white
 * cards in light mode, true black with elevated grays in dark mode. Text colors
 * follow the HIG label hierarchy; muted/subtle shades are darkened just enough
 * to keep WCAG AA on both `bg` and `surface`.
 */
export const lightColors: ColorScheme = {
  bg: '#F2F2F7',
  surface: palette.white,
  surfaceAlt: '#EFEFF4',
  surfacePressed: '#E5E5EA',
  border: '#D1D1D6',
  text: palette.black,
  textMuted: '#5E5E63',
  textSubtle: '#6C6C70',
  textInverse: palette.white,
  primary: palette.blue,
  primaryPressed: '#0062CC',
  primaryText: palette.white,
  primarySoft: '#E5F1FF',
  accent: palette.indigo,
  success: '#248A3D',
  successSoft: '#E6F7EA',
  warning: '#C93400',
  warningSoft: '#FFF3E0',
  danger: '#D70015',
  dangerSoft: '#FFEBEA',
  info: palette.blue,
  overlay: 'rgba(0,0,0,0.35)',
  gradient: [palette.blue, palette.indigo, palette.purple],
  priority: { low: palette.gray, medium: palette.blue, high: palette.orange, urgent: palette.red },
  categorical: [palette.blue, palette.orange, palette.green, palette.purple, palette.pink, palette.teal, palette.indigo, palette.yellow],
};

export const darkColors: ColorScheme = {
  bg: palette.black,
  surface: '#1C1C1E',
  surfaceAlt: '#2C2C2E',
  surfacePressed: '#3A3A3C',
  border: '#38383A',
  text: palette.white,
  textMuted: '#AEAEB2',
  textSubtle: '#98989F',
  textInverse: palette.black,
  primary: palette.blueDark,
  primaryPressed: '#409CFF',
  primaryText: palette.white,
  primarySoft: '#0A2540',
  accent: palette.indigoDark,
  success: palette.greenDark,
  successSoft: '#0E2A17',
  warning: palette.orangeDark,
  warningSoft: '#2E1F05',
  danger: palette.redDark,
  dangerSoft: '#3A1210',
  info: palette.blueDark,
  overlay: 'rgba(0,0,0,0.55)',
  gradient: [palette.blueDark, palette.indigoDark, palette.purpleDark],
  priority: { low: palette.gray, medium: palette.blueDark, high: palette.orangeDark, urgent: palette.redDark },
  categorical: [palette.blueDark, palette.orangeDark, palette.greenDark, palette.purpleDark, palette.pinkDark, palette.tealDark, palette.indigoDark, '#FFD60A'],
};

/** 4-pt spacing scale. */
export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { sm: 8, md: 12, lg: 14, xl: 20, pill: 999 } as const;

/** iOS text styles (SF Pro metrics: Large Title, Title 2, Headline, Body, Subheadline, Footnote, Caption). */
export const typography = {
  display: { fontSize: 34, lineHeight: 41, fontWeight: '700' as const, letterSpacing: 0.37 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const, letterSpacing: 0.36 },
  heading: { fontSize: 20, lineHeight: 25, fontWeight: '600' as const, letterSpacing: 0.38 },
  subheading: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const, letterSpacing: -0.41 },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' as const, letterSpacing: -0.41 },
  bodyStrong: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const, letterSpacing: -0.41 },
  caption: { fontSize: 15, lineHeight: 20, fontWeight: '400' as const, letterSpacing: -0.24 },
  small: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const, letterSpacing: -0.08 },
  overline: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const, letterSpacing: -0.08, textTransform: 'uppercase' as const },
} as const;

export type TypographyVariant = keyof typeof typography;

/** Apple UI is mostly flat: cards sit on the grouped background, shadows only on floating elements. */
export const elevation = {
  card: { shadowColor: '#000', shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 },
  raised: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
} as const;

/** Squircle corners like iOS (no-op on Android, where RN ignores it). */
export const continuous = { borderCurve: 'continuous' as const };

/** Minimum touch target (Android guidelines: 48dp). */
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;
export const MIN_TOUCH = 48;
