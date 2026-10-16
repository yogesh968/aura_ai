import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { IconButton } from './Button';
import { Text } from './Text';
import { OfflineBanner } from './States';

export interface ScreenProps {
  children: ReactNode;
  /** Wrap content in a ScrollView (default true). Use false for FlatList screens. */
  scroll?: boolean;
  padded?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  /** Extra bottom space so content clears the tab bar. */
  tabBarInset?: boolean;
  keyboard?: boolean;
  showOfflineBanner?: boolean;
}

/** Base screen: safe areas (edge-to-edge), background, optional scroll, pull-to-refresh and offline banner. */
export function Screen({
  children,
  scroll = true,
  padded = true,
  header,
  footer,
  refreshing,
  onRefresh,
  contentStyle,
  tabBarInset,
  keyboard = true,
  showOfflineBanner = true,
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPad = (tabBarInset ? 96 : 24) + (footer ? 0 : insets.bottom);
  const inner = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[padded && styles.padded, { paddingBottom: bottomPad }, contentStyle]}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, padded && styles.paddedX, contentStyle]}>{children}</View>
  );
  const body = (
    <View style={{ flex: 1 }}>
      {header}
      {showOfflineBanner ? <OfflineBanner /> : null}
      {inner}
      {footer ? <View style={{ paddingBottom: insets.bottom }}>{footer}</View> : null}
    </View>
  );
  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: header ? 0 : insets.top }]}>
      {keyboard ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </View>
  );
}

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  back?: boolean;
  onBack?: () => void;
  right?: ReactNode;
  large?: boolean;
}

/** In-screen header (native headers are hidden app-wide for a consistent look). */
export function ScreenHeader({ title, subtitle, back = true, onBack, right, large }: ScreenHeaderProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 4, backgroundColor: colors.bg }]}>
      <View style={styles.headerRow}>
        {back ? (
          <IconButton icon="chevron-back" label="Go back" onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))} />
        ) : (
          <View style={{ width: 8 }} />
        )}
        <View style={{ flex: 1 }}>
          {!large ? (
            <Text variant="heading" numberOfLines={1} accessibilityRole="header">
              {title}
            </Text>
          ) : null}
        </View>
        <View style={styles.headerRight}>{right}</View>
      </View>
      {large ? (
        <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" color="textMuted">
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : subtitle ? (
        <Text variant="caption" color="textMuted" style={{ paddingHorizontal: 56, marginTop: -6, paddingBottom: 6 }} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  padded: { paddingHorizontal: 20, paddingTop: 8 },
  paddedX: { paddingHorizontal: 20 },
  header: { paddingBottom: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, minHeight: 52, gap: 4 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
});
