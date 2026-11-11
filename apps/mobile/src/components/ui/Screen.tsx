import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
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
import { HIT_SLOP } from '@/theme/tokens';
import { haptics } from '@/lib/haptics';
import { Icon } from './Icon';
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
  const bottomPad = (tabBarInset ? 84 : 24) + (footer ? 0 : insets.bottom);
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

/**
 * iOS-style navigation bar (native headers are hidden app-wide for a consistent look):
 * "< Back" on the left, centered inline title, actions on the right, optional large title.
 */
export function ScreenHeader({ title, subtitle, back = true, onBack, right, large }: ScreenHeaderProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const goBack = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  return (
    <View
      style={[
        { paddingTop: insets.top, backgroundColor: colors.bg },
        !large ? { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth } : null,
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerSide}>
          {back ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={HIT_SLOP}
              onPress={() => {
                haptics.tap();
                goBack();
              }}
              style={({ pressed }) => [styles.back, { opacity: pressed ? 0.4 : 1 }]}
            >
              <Icon name="chevron-back" size={28} color="primary" />
              <Text variant="body" color="primary" style={{ marginLeft: -4 }}>
                Back
              </Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.headerTitle} pointerEvents="none">
          {!large ? (
            <>
              <Text variant="subheading" numberOfLines={1} accessibilityRole="header" align="center">
                {title}
              </Text>
              {subtitle ? (
                <Text variant="small" color="textMuted" numberOfLines={1} align="center">
                  {subtitle}
                </Text>
              ) : null}
            </>
          ) : null}
        </View>
        <View style={[styles.headerSide, styles.headerRight]}>{right}</View>
      </View>
      {large ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <Text variant="display" accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" color="textMuted">
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  padded: { paddingHorizontal: 16, paddingTop: 8 },
  paddedX: { paddingHorizontal: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, minHeight: 48 },
  headerSide: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  headerTitle: { flex: 2, alignItems: 'center', justifyContent: 'center' },
  headerRight: { justifyContent: 'flex-end' },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingRight: 8 },
});
