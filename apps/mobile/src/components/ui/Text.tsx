import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import type { ColorScheme, TypographyVariant } from '@/theme/tokens';

type ColorKey = { [K in keyof ColorScheme]: ColorScheme[K] extends string ? K : never }[keyof ColorScheme];

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  color?: ColorKey;
  align?: TextStyle['textAlign'];
  weight?: TextStyle['fontWeight'];
}

/** Themed text. Font scaling is respected for accessibility (capped to keep layouts intact). */
export function Text({ variant = 'body', color = 'text', align, weight, style, ...rest }: TextProps) {
  const { colors, typography } = useTheme();
  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      {...rest}
      style={[typography[variant], { color: colors[color] }, align ? { textAlign: align } : null, weight ? { fontWeight: weight } : null, style]}
    />
  );
}
