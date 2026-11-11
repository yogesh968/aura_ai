import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { continuous, elevation, MIN_TOUCH } from '@/theme/tokens';
import { haptics } from '@/lib/haptics';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.section}>
      <Text variant="overline" color="textMuted" accessibilityRole="header">
        {title}
      </Text>
      {action && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={12} style={({ pressed }) => ({ opacity: pressed ? 0.4 : 1 })}>
          <Text variant="caption" color="primary">
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export interface ListItemProps {
  title: string;
  subtitle?: string | null;
  icon?: IconName;
  iconColor?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  strikethrough?: boolean;
  accessibilityHint?: string;
}

export function ListItem({ title, subtitle, icon, iconColor, left, right, onPress, onLongPress, chevron, destructive, strikethrough, accessibilityHint }: ListItemProps) {
  const { colors } = useTheme();
  const content = (
    <>
      {left ?? (icon ? (
        <View style={[styles.listIcon, continuous, { backgroundColor: iconColor ?? (destructive ? colors.danger : colors.primary) }]}>
          <Icon name={icon} size={17} color="#FFFFFF" />
        </View>
      ) : null)}
      <View style={{ flex: 1 }}>
        <Text variant="body" color={destructive ? 'danger' : strikethrough ? 'textSubtle' : 'text'} numberOfLines={2} style={strikethrough ? { textDecorationLine: 'line-through' } : null}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" color="textMuted" numberOfLines={2} style={{ marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron ? <Icon name="chevron-forward" size={18} color="border" /> : null}
    </>
  );
  if (!onPress && !onLongPress) return <View style={styles.listItem}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityHint={accessibilityHint}
      onPress={
        onPress
          ? () => {
              haptics.tap();
              onPress();
            }
          : undefined
      }
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.listItem, pressed ? { backgroundColor: colors.surfacePressed } : null]}
    >
      {content}
    </Pressable>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: inset }} />;
}

export function Badge({ label, tone = 'default' }: { label: string; tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger' }) {
  const { colors } = useTheme();
  const map = {
    default: [colors.surfaceAlt, 'textMuted'],
    primary: [colors.primarySoft, 'primary'],
    success: [colors.successSoft, 'success'],
    warning: [colors.warningSoft, 'warning'],
    danger: [colors.dangerSoft, 'danger'],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text variant="small" color={fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  color?: string;
}

export function Chip({ label, selected, onPress, icon, color }: ChipProps) {
  const { colors, radius } = useTheme();
  const accent = color ?? colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={label}
      onPress={() => {
        haptics.tap();
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.chip,
        {
          borderRadius: radius.pill,
          backgroundColor: selected ? accent : pressed ? colors.surfacePressed : colors.surfaceAlt,
        },
      ]}
    >
      {icon ? <Icon name={icon} size={14} color={selected ? colors.primaryText : colors.textMuted} /> : null}
      <Text variant="caption" weight={selected ? '600' : '400'} style={{ color: selected ? colors.primaryText : colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Horizontal, scrollable chip group for single selection. */
export function ChipGroup<T extends string>({ options, value, onChange }: { options: { value: T; label: string; icon?: IconName }[]; value: T; onChange: (v: T) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
      {options.map((o) => (
        <Chip key={o.value} label={o.label} icon={o.icon} selected={o.value === value} onPress={() => onChange(o.value)} />
      ))}
    </ScrollView>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const { colors, dark } = useTheme();
  return (
    <View style={[styles.segmented, continuous, { backgroundColor: dark ? colors.surfaceAlt : colors.surfacePressed }]} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              haptics.tap();
              onChange(o.value);
            }}
            style={[
              styles.segment,
              continuous,
              active ? [{ backgroundColor: dark ? colors.surfacePressed : colors.surface }, styles.segmentActive] : null,
            ]}
          >
            <Text variant="small" weight={active ? '600' : '500'} color="text" numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProgressBar({ value, color, height = 8, label }: { value: number; color?: string; height?: number; label?: string }) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={{ height, borderRadius: height / 2, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}
    >
      <View style={{ width: `${pct * 100}%`, height, borderRadius: height / 2, backgroundColor: color ?? colors.primary }} />
    </View>
  );
}

export function ProgressRing({ value, size = 64, stroke = 7, color, children, label }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode; label?: string }) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size }} accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceAlt} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color ?? colors.primary}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - pct)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>{children}</View>
    </View>
  );
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const { colors } = useTheme();
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.textSubtle, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="bodyStrong" style={{ fontSize: size * 0.4, color: colors.surface }}>
        {initials || '?'}
      </Text>
    </View>
  );
}

/** Floating action button positioned above the tab bar. */
export function Fab({ icon = 'add', label, onPress, bottom = 100 }: { icon?: IconName; label: string; onPress: () => void; bottom?: number }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptics.light();
        onPress();
      }}
      style={({ pressed }) => [styles.fab, elevation.raised, { bottom, backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
    >
      <Icon name={icon} size={26} color="primaryText" />
    </Pressable>
  );
}

export function Checkbox({ checked, onToggle, label, color }: { checked: boolean; onToggle: () => void; label: string; color?: string }) {
  const { colors } = useTheme();
  const c = color ?? colors.primary;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      hitSlop={12}
      onPress={() => {
        haptics.light();
        onToggle();
      }}
      style={[styles.checkbox, { borderColor: checked ? c : colors.textSubtle, backgroundColor: checked ? c : 'transparent' }]}
    >
      {checked ? <Icon name="checkmark" size={15} color="#FFFFFF" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 28, marginBottom: 7, paddingHorizontal: 16 },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 50, paddingVertical: 8, paddingHorizontal: 4 },
  listIcon: { width: 30, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, alignSelf: 'flex-start' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 34 },
  segmented: { flexDirection: 'row', padding: 2, borderRadius: 9 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 32, paddingHorizontal: 8, borderRadius: 7 },
  segmentActive: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  fab: { position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', minWidth: 24 },
});

export const MIN_TOUCH_SIZE = MIN_TOUCH;
