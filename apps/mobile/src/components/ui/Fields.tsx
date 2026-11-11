import { forwardRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { continuous, palette } from '@/theme/tokens';
import { haptics } from '@/lib/haptics';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string | null;
  helper?: string;
  icon?: IconName;
  right?: ReactNode;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, helper, icon, right, style, multiline, onFocus, onBlur, ...rest },
  ref,
) {
  const { colors, radius, typography } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text variant="overline" color="textMuted" style={{ marginLeft: 16 }}>
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.field,
          continuous,
          {
            borderRadius: radius.md,
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : focused ? colors.primary : 'transparent',
            minHeight: multiline ? 96 : 50,
            alignItems: multiline ? 'flex-start' : 'center',
          },
        ]}
      >
        {icon ? (
          <View style={{ paddingTop: multiline ? 12 : 0 }}>
            <Icon name={icon} size={18} color="textMuted" />
          </View>
        ) : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textSubtle}
          selectionColor={colors.primary}
          accessibilityLabel={label ?? rest.placeholder}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            typography.body,
            { flex: 1, color: colors.text, paddingVertical: multiline ? 12 : 8, textAlignVertical: multiline ? 'top' : 'center' },
            style,
          ]}
          {...rest}
        />
        {right}
      </View>
      {error ? (
        <Text variant="small" color="danger" accessibilityLiveRegion="polite" style={{ marginLeft: 16 }}>
          {error}
        </Text>
      ) : helper ? (
        <Text variant="small" color="textSubtle" style={{ marginLeft: 16 }}>
          {helper}
        </Text>
      ) : null}
    </View>
  );
});

export function ToggleRow({ label, description, value, onChange, disabled, icon }: { label: string; description?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; icon?: IconName }) {
  const { colors, dark } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => {
        haptics.tap();
        onChange(!value);
      }}
      style={[styles.toggle, { opacity: disabled ? 0.5 : 1 }]}
    >
      {icon ? <Icon name={icon} size={20} color="textMuted" /> : null}
      <View style={{ flex: 1 }}>
        <Text variant="body">{label}</Text>
        {description ? (
          <Text variant="small" color="textMuted" style={{ marginTop: 2 }}>
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        // iOS switches are green regardless of the app tint.
        trackColor={{ true: dark ? palette.greenDark : palette.green, false: colors.surfacePressed }}
        thumbColor={palette.white}
        ios_backgroundColor={colors.surfacePressed}
        importantForAccessibility="no"
      />
    </Pressable>
  );
}

/** Row that opens a picker/editor: label on the left, current value on the right. */
export function SelectRow({ label, value, onPress, icon, placeholder = 'Choose' }: { label: string; value?: string | null; onPress: () => void; icon?: IconName; placeholder?: string }) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value ?? placeholder}`}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.select,
        continuous,
        { borderRadius: radius.md, backgroundColor: pressed ? colors.surfacePressed : colors.surface },
      ]}
    >
      {icon ? <Icon name={icon} size={20} color="primary" /> : null}
      <Text variant="body" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="body" color={value ? 'textMuted' : 'textSubtle'} numberOfLines={1} style={{ maxWidth: '55%' }}>
        {value ?? placeholder}
      </Text>
      <Icon name="chevron-forward" size={18} color="border" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', gap: 10, borderWidth: 1, paddingHorizontal: 16 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, paddingVertical: 6 },
  select: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingHorizontal: 16 },
});
