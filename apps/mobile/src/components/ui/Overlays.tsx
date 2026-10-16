import { useEffect, type ReactNode } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useTheme } from '@/theme/ThemeProvider';
import { useToastStore } from '@/lib/toast';
import { formatDateTime, formatTime, relativeDay } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { Button, IconButton } from './Button';
import { Card } from './Card';
import { SelectRow } from './Fields';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/** Bottom sheet built on Modal (back button and scrim dismiss). */
export function Sheet({ visible, onClose, title, children, footer }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode; footer?: ReactNode }) {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
      <View style={styles.sheetWrap} pointerEvents="box-none">
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingBottom: insets.bottom + 12 }]}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          {title ? (
            <View style={styles.sheetHeader}>
              <Text variant="heading" style={{ flex: 1 }} accessibilityRole="header">
                {title}
              </Text>
              <IconButton icon="close" label="Close" onPress={onClose} />
            </View>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 520 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}>
            {children}
          </ScrollView>
          {footer ? <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  icon?: IconName;
}

export function SelectSheet<T extends string>({ visible, onClose, title, options, value, onSelect }: { visible: boolean; onClose: () => void; title: string; options: SelectOption<T>[]; value?: T | null; onSelect: (v: T) => void }) {
  const { colors } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => {
              haptics.tap();
              onSelect(o.value);
              onClose();
            }}
            style={({ pressed }) => [styles.option, { backgroundColor: pressed ? colors.surfacePressed : 'transparent' }]}
          >
            {o.icon ? <Icon name={o.icon} size={20} color={active ? 'primary' : 'textMuted'} /> : null}
            <View style={{ flex: 1 }}>
              <Text variant="body" weight={active ? '700' : '400'} color={active ? 'primary' : 'text'}>
                {o.label}
              </Text>
              {o.description ? (
                <Text variant="small" color="textMuted">
                  {o.description}
                </Text>
              ) : null}
            </View>
            {active ? <Icon name="checkmark" size={20} color="primary" /> : null}
          </Pressable>
        );
      })}
    </Sheet>
  );
}

/**
 * Date / time / date-time picker row. Uses the native Android dialogs
 * (date first, then time for 'datetime').
 */
export function DateTimeField({
  label,
  value,
  onChange,
  mode = 'datetime',
  clearable = true,
  minimumDate,
  icon = 'calendar-outline',
  placeholder = 'Not set',
}: {
  label: string;
  value: Date | null;
  onChange: (d: Date | null) => void;
  mode?: 'date' | 'time' | 'datetime';
  clearable?: boolean;
  minimumDate?: Date;
  icon?: IconName;
  placeholder?: string;
}) {
  const display = value ? (mode === 'date' ? relativeDay(value) : mode === 'time' ? formatTime(value) : formatDateTime(value)) : null;

  const open = () => {
    const base = value ?? defaultDate();
    if (Platform.OS !== 'android') return;
    const pickTime = (day: Date) =>
      DateTimePickerAndroid.open({
        value: day,
        mode: 'time',
        is24Hour: false,
        onChange: (e, t) => {
          if (e.type !== 'set' || !t) return;
          const merged = new Date(day);
          merged.setHours(t.getHours(), t.getMinutes(), 0, 0);
          onChange(merged);
        },
      });
    if (mode === 'time') {
      pickTime(base);
      return;
    }
    DateTimePickerAndroid.open({
      value: base,
      mode: 'date',
      minimumDate,
      onChange: (e, d) => {
        if (e.type !== 'set' || !d) return;
        const day = new Date(d);
        day.setHours(base.getHours(), base.getMinutes(), 0, 0);
        if (mode === 'date') onChange(day);
        else pickTime(day);
      },
    });
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ flex: 1 }}>
        <SelectRow label={label} value={display} onPress={open} icon={icon} placeholder={placeholder} />
      </View>
      {clearable && value ? <IconButton icon="close-circle" label={`Clear ${label}`} onPress={() => onChange(null)} /> : null}
    </View>
  );
}

function defaultDate() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

/** Explains why a permission is needed before asking, and links to Settings when blocked. */
export function PermissionCard({
  icon,
  title,
  reason,
  status,
  onRequest,
  grantedLabel = 'Enabled',
}: {
  icon: IconName;
  title: string;
  reason: string;
  status: 'granted' | 'denied' | 'undetermined' | 'unavailable';
  onRequest: () => void;
  grantedLabel?: string;
}) {
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name={icon} size={22} color={status === 'granted' ? 'success' : 'primary'} />
        <Text variant="subheading" style={{ flex: 1 }}>
          {title}
        </Text>
        {status === 'granted' ? (
          <Text variant="small" color="success">
            {grantedLabel}
          </Text>
        ) : null}
      </View>
      <Text variant="caption" color="textMuted">
        {reason}
      </Text>
      {status === 'undetermined' ? <Button title="Allow" size="sm" variant="soft" onPress={onRequest} /> : null}
      {status === 'denied' ? (
        <View style={{ gap: 8 }}>
          <Text variant="small" color="warning">
            Permission is off. You can turn it on in system settings.
          </Text>
          <Button title="Open settings" size="sm" variant="secondary" icon="settings-outline" onPress={() => void Linking.openSettings()} />
        </View>
      ) : null}
      {status === 'unavailable' ? (
        <Text variant="small" color="textMuted">
          Not available on this device or build.
        </Text>
      ) : null}
    </Card>
  );
}

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const latest = toasts[toasts.length - 1];
  useEffect(() => {
    if (latest?.kind === 'error') haptics.error();
  }, [latest]);
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', paddingBottom: insets.bottom + 92, paddingHorizontal: 16 }]}>
      {toasts.map((t) => (
        <Animated.View key={t.id} entering={FadeInDown.duration(200)} exiting={FadeOutDown.duration(150)} style={{ marginTop: 8 }}>
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[styles.toast, { borderRadius: radius.md, backgroundColor: t.kind === 'error' ? colors.danger : colors.text }]}
          >
            <Icon name={t.kind === 'error' ? 'alert-circle' : t.kind === 'success' ? 'checkmark-circle' : 'information-circle'} size={18} color={colors.bg} />
            <Text variant="caption" style={{ color: colors.bg, flex: 1 }}>
              {t.message}
            </Text>
            {t.action ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  t.action!.onPress();
                  dismiss(t.id);
                }}
                hitSlop={12}
              >
                <Text variant="caption" weight="700" style={{ color: colors.bg, textDecorationLine: 'underline' }}>
                  {t.action.label}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { paddingTop: 8 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 8, borderRadius: 12 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
});
