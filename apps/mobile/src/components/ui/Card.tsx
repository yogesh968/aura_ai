import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme/ThemeProvider';
import { elevation } from '@/theme/tokens';
import { haptics } from '@/lib/haptics';

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  tone?: 'default' | 'alt' | 'primary' | 'success' | 'warning' | 'danger';
}

export function Card({ children, onPress, onLongPress, accessibilityLabel, padded = true, style, tone = 'default' }: CardProps) {
  const { colors, radius, dark } = useTheme();
  const bg = {
    default: colors.surface,
    alt: colors.surfaceAlt,
    primary: colors.primarySoft,
    success: colors.successSoft,
    warning: colors.warningSoft,
    danger: colors.dangerSoft,
  }[tone];
  const base: StyleProp<ViewStyle> = [
    styles.card,
    { backgroundColor: bg, borderRadius: radius.lg, borderColor: colors.border, padding: padded ? 16 : 0 },
    !dark && tone === 'default' ? elevation.card : null,
    style,
  ];
  if (!onPress && !onLongPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={
        onPress
          ? () => {
              haptics.tap();
              onPress();
            }
          : undefined
      }
      onLongPress={onLongPress}
      style={({ pressed }) => [base, pressed ? { opacity: 0.85, transform: [{ scale: 0.99 }] } : null]}
    >
      {children}
    </Pressable>
  );
}

/** Hero card with the brand gradient. */
export function GradientCard({ children, style, onPress, accessibilityLabel }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string }) {
  const { colors, radius } = useTheme();
  const content = (
    <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ borderRadius: radius.xl, padding: 20 }, style]}>
      {children}
    </LinearGradient>
  );
  if (!onPress) return content;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth },
});
