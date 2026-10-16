import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
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

/** Custom tab bar with a raised assistant orb in the middle (long-press opens voice mode). */
function AuraTabBar({ state, navigation }: TabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 8) }]} accessibilityRole="tablist">
      {state.routes.map((route, index) => {
        const meta = TABS[route.name];
        if (!meta) return null;
        const focused = state.index === index;
        const onPress = () => {
          haptics.tap();
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };
        if (route.name === 'assistant') {
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel="Aura assistant"
              accessibilityHint="Double tap to chat. Long press for voice mode."
              onPress={onPress}
              onLongPress={() => {
                haptics.medium();
                router.push('/voice');
              }}
              style={styles.orbSlot}
            >
              <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.orb}>
                <Icon name={focused ? meta.iconActive : meta.icon} size={26} color="#FFFFFF" />
              </LinearGradient>
            </Pressable>
          );
        }
        return (
          <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={meta.label} onPress={onPress} style={styles.tab}>
            <Icon name={focused ? meta.iconActive : meta.icon} size={22} color={focused ? 'primary' : 'textSubtle'} />
            <Text variant="small" color={focused ? 'primary' : 'textSubtle'} weight={focused ? '700' : '500'}>
              {meta.label}
            </Text>
          </Pressable>
        );
      })}
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
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'flex-end', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 52 },
  orbSlot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', minHeight: 52 },
  orb: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', marginTop: -22, elevation: 6, shadowColor: '#7C5CFF', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
});
