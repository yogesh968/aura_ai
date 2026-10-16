import { Redirect, Stack, useSegments } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { useSettingsStore } from '@/lib/settings';

/** Signed-in area: tabs plus detail screens. First-run personalization happens in /setup. */
export default function AppLayout() {
  const { colors } = useTheme();
  const onboardingComplete = useSettingsStore((s) => s.onboardingComplete);
  const segments = useSegments();
  const inSetup = segments[segments.length - 1] === 'setup';

  if (!onboardingComplete && !inSetup) return <Redirect href="/setup" />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="setup" options={{ gestureEnabled: false, animation: 'fade' }} />
      <Stack.Screen name="voice" options={{ presentation: 'fullScreenModal', animation: 'fade_from_bottom' }} />
    </Stack>
  );
}
