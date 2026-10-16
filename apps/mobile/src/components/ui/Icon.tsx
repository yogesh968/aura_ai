import type { ComponentProps } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/theme/ThemeProvider';
import type { ColorScheme } from '@/theme/tokens';

export type IconName = ComponentProps<typeof Ionicons>['name'];
type ColorKey = { [K in keyof ColorScheme]: ColorScheme[K] extends string ? K : never }[keyof ColorScheme];

export interface IconProps {
  name: IconName;
  size?: number;
  /** A theme color key, or a raw color string. */
  color?: ColorKey | (string & {});
  accessibilityLabel?: string;
}

export function Icon({ name, size = 22, color = 'text', accessibilityLabel }: IconProps) {
  const { colors } = useTheme();
  const resolved = (colors as unknown as Record<string, unknown>)[color];
  return (
    <Ionicons
      name={name}
      size={size}
      color={typeof resolved === 'string' ? resolved : color}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
    />
  );
}
