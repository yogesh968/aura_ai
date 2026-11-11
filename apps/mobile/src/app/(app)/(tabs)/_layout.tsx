import type { ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, Text, type IconName } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { haptics } from '@/lib/haptics';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const TABS: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  index: { label: 'Home', icon: 'home-outline', iconActive: 'home' },
  plan: { label: 'Plan', icon: 'calendar-outline', iconActive: 'calendar' },
  assistant: { label: 'Aura', icon: 'sparkles-outline', iconActive: 'sparkles' },
  life: { label: 'Life', icon: 'heart-outline', iconActive: 'heart' },
  more: { label: 'More', icon: 'grid-outline', iconActive: 'grid' },
};

/**
 * iOS-style tab bar: translucent material with a hairline top border, filled icon for the
 * selected tab and small labels. Long-pressing the Aura tab opens voice mode.
 */
function AuraTabBar({ state, navigation }: TabBarProps) {
  const { colors, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const barStyle = [styles.bar, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 6) }];
  const tabs = state.routes.map((route, index) => {
    const meta = TABS[route.name];
    if (!meta) return null;
    const focused = state.index === index;
    const isAura = route.name === 'assistant';
    const onPress = () => {
      haptics.tap();
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
    };
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={isAura ? 'Aura assistant' : meta.label}
        accessibilityHint={isAura ? 'Double tap to chat. Long press for voice mode.' : undefined}
        onPress={onPress}
        onLongPress={
          isAura
            ? () => {
                haptics.medium();
                router.push('/voice');
              }
            : undefined
        }
        style={styles.tab}
      >
        <Icon name={focused ? meta.iconActive : meta.icon} size={25} color={focused ? 'primary' : 'textSubtle'} />
        <Text variant="small" color={focused ? 'primary' : 'textSubtle'} weight="500" style={styles.label}>
          {meta.label}
        </Text>
      </Pressable>
    );
  });
  // Real blur on iOS; Android's blur needs a BlurTargetView around the screens, so use a translucent fill there.
  if (Platform.OS === 'ios') {
    return (
      <BlurView tint={dark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'} intensity={100} style={barStyle} accessibilityRole="tablist">
        {tabs}
      </BlurView>
    );
  }
  return (
    <View style={[barStyle, { backgroundColor: dark ? 'rgba(22,22,24,0.96)' : 'rgba(249,249,249,0.96)' }]} accessibilityRole="tablist">
      {tabs}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <AuraTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="plan" />
      <Tabs.Screen name="assistant" />
      <Tabs.Screen name="life" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 1, minHeight: 48 },
  label: { fontSize: 10, lineHeight: 12, letterSpacing: 0.1 },
});
