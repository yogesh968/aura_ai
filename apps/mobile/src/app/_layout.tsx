import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { ToastHost } from '@/components/ui';
import { AppEffects } from '@/lib/AppEffects';
import { loadApiBaseUrl } from '@/lib/api/config';
import { useAuthStore } from '@/lib/auth/store';
import { queryClient } from '@/lib/data';
import { getDb } from '@/lib/db/database';
import { setupNotifications } from '@/lib/notifications/scheduler';
import { useSettingsStore } from '@/lib/settings';

void SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const status = useAuthStore((s) => s.status);
  const { colors, dark } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
        <Stack.Protected guard={status === 'signedIn'}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={status !== 'signedIn'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
      <AppEffects />
      <ToastHost />
    </View>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([getDb(), loadApiBaseUrl(), useSettingsStore.getState().hydrate()]);
        await useAuthStore.getState().bootstrap();
        await setupNotifications().catch(() => undefined);
      } finally {
        setReady(true);
        await SplashScreen.hideAsync().catch(() => undefined);
      }
    })();
  }, []);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <RootNavigator />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
