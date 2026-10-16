import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { darkColors, lightColors, radius, spacing, typography, type ColorScheme } from './tokens';
import { useSettingsStore } from '@/lib/settings';

export interface Theme {
  dark: boolean;
  colors: ColorScheme;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
}

const ThemeContext = createContext<Theme | null>(null);

/** Resolves the user's theme preference (system / light / dark) into tokens. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const preference = useSettingsStore((s) => s.theme);
  const dark = preference === 'system' ? system === 'dark' : preference === 'dark';
  const value = useMemo<Theme>(
    () => ({ dark, colors: dark ? darkColors : lightColors, spacing, radius, typography }),
    [dark],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const t = useContext(ThemeContext);
  if (!t) throw new Error('useTheme must be used inside ThemeProvider');
  return t;
}
