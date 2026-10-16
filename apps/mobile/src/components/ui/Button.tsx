import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { HIT_SLOP, MIN_TOUCH } from '@/theme/tokens';
import { haptics } from '@/lib/haptics';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  title: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading,
  disabled,
  fullWidth,
  style,
  onPress,
  ...rest
}: ButtonProps) {
  const { colors, radius } = useTheme();
  const palette = {
    primary: { bg: colors.primary, pressed: colors.primaryPressed, fg: 'primaryText' as const, border: 'transparent' },
    secondary: { bg: colors.surface, pressed: colors.surfacePressed, fg: 'text' as const, border: colors.border },
    ghost: { bg: 'transparent', pressed: colors.surfacePressed, fg: 'primary' as const, border: 'transparent' },
    danger: { bg: colors.danger, pressed: colors.danger, fg: 'textInverse' as const, border: 'transparent' },
    soft: { bg: colors.primarySoft, pressed: colors.surfacePressed, fg: 'primary' as const, border: 'transparent' },
  }[variant];
  const height = size === 'sm' ? 36 : size === 'lg' ? 56 : MIN_TOUCH;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      hitSlop={size === 'sm' ? HIT_SLOP : undefined}
      disabled={isDisabled}
      onPress={(e) => {
        haptics.tap();
        onPress?.(e);
      }}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          paddingHorizontal: size === 'sm' ? 14 : 20,
          borderRadius: radius.pill,
          backgroundColor: pressed ? palette.pressed : palette.bg,
          borderColor: palette.border,
          opacity: isDisabled ? 0.55 : 1,
          alignSelf: fullWidth ? 'stretch' : 'auto',
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={colors[palette.fg]} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 20} color={palette.fg} /> : null}
          <Text variant={size === 'sm' ? 'caption' : 'bodyStrong'} color={palette.fg} weight="600" numberOfLines={1}>
            {title}
          </Text>
          {iconRight ? <Icon name={iconRight} size={size === 'sm' ? 16 : 20} color={palette.fg} /> : null}
        </View>
      )}
    </Pressable>
  );
}

export interface IconButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  icon: IconName;
  label: string;
  variant?: 'plain' | 'filled' | 'soft';
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/** Icon-only button with an accessible label and a 48dp touch target. */
export function IconButton({ icon, label, variant = 'plain', size = 22, color, style, onPress, disabled, ...rest }: IconButtonProps) {
  const { colors } = useTheme();
  const bg = variant === 'filled' ? colors.primary : variant === 'soft' ? colors.primarySoft : 'transparent';
  const fg = color ?? (variant === 'filled' ? colors.primaryText : variant === 'soft' ? colors.primary : colors.text);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      onPress={(e) => {
        haptics.tap();
        onPress?.(e);
      }}
      style={({ pressed }) => [
        styles.icon,
        { backgroundColor: pressed ? colors.surfacePressed : bg, opacity: disabled ? 0.4 : 1 },
        style,
      ]}
      {...rest}
    >
      <Icon name={icon} size={size} color={fg} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: MIN_TOUCH / 2, alignItems: 'center', justifyContent: 'center' },
});
