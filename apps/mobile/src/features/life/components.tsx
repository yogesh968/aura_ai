import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { IconButton, Icon, Text, type IconName } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { haptics } from '@/lib/haptics';
import { MOOD_FACES, monthLabel, shiftMonth } from './helpers';

/** Simple bar chart (oldest → newest), with an optional target line color change. */
export function MiniBars({
  values,
  height = 40,
  width = 120,
  color,
  target,
  label,
}: {
  values: number[];
  height?: number;
  width?: number;
  color?: string;
  target?: number;
  label?: string;
}) {
  const { colors } = useTheme();
  const max = Math.max(...values, target ?? 0, 1);
  const gap = 3;
  const barW = Math.max(2, (width - gap * (values.length - 1)) / Math.max(values.length, 1));
  return (
    <View accessible accessibilityLabel={label ?? `Chart of ${values.length} values`}>
      <Svg width={width} height={height}>
        {values.map((v, i) => {
          const h = v > 0 ? Math.max(3, (v / max) * height) : 2;
          const met = target != null && v >= target;
          return (
            <Rect
              key={i}
              x={i * (barW + gap)}
              y={height - h}
              width={barW}
              height={h}
              rx={Math.min(3, barW / 2)}
              fill={v <= 0 ? colors.surfaceAlt : met ? colors.success : (color ?? colors.primary)}
            />
          );
        })}
      </Svg>
    </View>
  );
}

export function MonthSelector({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <View style={styles.month}>
      <IconButton icon="chevron-back" label="Previous month" onPress={() => onChange(shiftMonth(month, -1))} />
      <Text variant="subheading" style={{ flex: 1 }} align="center" accessibilityLiveRegion="polite">
        {monthLabel(month)}
      </Text>
      <IconButton icon="chevron-forward" label="Next month" onPress={() => onChange(shiftMonth(month, 1))} />
    </View>
  );
}

export function MoodPicker({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  const { colors, radius } = useTheme();
  return (
    <View style={styles.moods} accessibilityRole="radiogroup" accessibilityLabel="Mood">
      {MOOD_FACES.map((face, i) => {
        const v = i + 1;
        const active = value === v;
        return (
          <Pressable
            key={v}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Mood ${v} of 5`}
            onPress={() => {
              haptics.tap();
              onChange(v);
            }}
            style={[styles.mood, { borderRadius: radius.md, backgroundColor: active ? colors.primarySoft : colors.surfaceAlt, borderColor: active ? colors.primary : 'transparent' }]}
          >
            <Text style={{ fontSize: 26 }}>{face}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Row of 7 dots showing whether a habit target was met each day. */
export function WeekDots({ met }: { met: boolean[] }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 4 }} accessible accessibilityLabel={`Met target on ${met.filter(Boolean).length} of the last ${met.length} days`}>
      {met.map((m, i) => (
        <View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: m ? colors.success : colors.surfaceAlt }} />
      ))}
    </View>
  );
}

export function StatTile({ label, value, tone, icon }: { label: string; value: string; tone?: 'success' | 'danger' | 'default'; icon?: IconName }) {
  const { colors, radius } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon ? <Icon name={icon} size={14} color="textMuted" /> : null}
        <Text variant="small" color="textMuted">
          {label}
        </Text>
      </View>
      <Text variant="subheading" color={tone === 'success' ? 'success' : tone === 'danger' ? 'danger' : 'text'} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

export const HABIT_ICONS: IconName[] = [
  'checkmark-circle-outline',
  'leaf-outline',
  'book-outline',
  'barbell-outline',
  'water-outline',
  'bed-outline',
  'walk-outline',
  'bicycle-outline',
  'musical-notes-outline',
  'code-slash-outline',
  'brush-outline',
  'nutrition-outline',
  'happy-outline',
  'language-outline',
  'heart-outline',
  'sunny-outline',
];

export const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function daysLabel(days: number[]): string {
  const sorted = [...days].sort();
  if (sorted.length === 7) return 'Every day';
  if (sorted.join() === '1,2,3,4,5') return 'Weekdays';
  if (sorted.join() === '0,6') return 'Weekends';
  if (sorted.length === 0) return 'No days';
  return sorted.map((d) => WEEKDAY_NAMES[d]!.slice(0, 3)).join(', ');
}

const styles = StyleSheet.create({
  month: { flexDirection: 'row', alignItems: 'center' },
  moods: { flexDirection: 'row', gap: 8 },
  mood: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  stat: { flex: 1, padding: 12, gap: 4, borderWidth: StyleSheet.hairlineWidth },
});
