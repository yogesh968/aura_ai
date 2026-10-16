import { View } from 'react-native';
import { IconButton, Text } from '@/components/ui';
import { stepValue } from './prefs';

/** Accessible +/- stepper for numeric settings. */
export function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format = (v) => String(v),
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
}) {
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52 }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: format(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onChange(stepValue(value, e.nativeEvent.actionName === 'increment' ? step : -step, min, max, step))}
    >
      <Text variant="body" style={{ flex: 1 }}>
        {label}
      </Text>
      <IconButton icon="remove-circle-outline" label={`Decrease ${label}`} disabled={value <= min} onPress={() => onChange(stepValue(value, -step, min, max, step))} />
      <Text variant="bodyStrong" style={{ minWidth: 72, textAlign: 'center' }}>
        {format(value)}
      </Text>
      <IconButton icon="add-circle-outline" label={`Increase ${label}`} disabled={value >= max} onPress={() => onChange(stepValue(value, step, min, max, step))} />
    </View>
  );
}
