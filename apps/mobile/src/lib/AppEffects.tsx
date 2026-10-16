import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useAuthStore } from '@/lib/auth/store';
import { endpoints } from '@/lib/api/endpoints';
import { setLocalWriteHook, subscribeToChanges } from '@/lib/db/repo';
import { useNetworkMonitor } from '@/lib/network';
import { reconcileNotifications } from '@/lib/notifications/scheduler';
import { useSettingsStore } from '@/lib/settings';
import { refreshPendingCount, scheduleSync, setSyncEnabled, syncNow } from '@/lib/sync/engine';

const SCHEDULE_TYPES = new Set(['reminder', 'task', 'event', 'recurringPayment']);

/**
 * App-wide side effects while signed in:
 * - sync on launch, on reconnect, on foreground, every 2 minutes, and after local edits
 * - keep local notifications in line with data and preferences
 * - refresh preferences from the server
 * - route notification taps to the right screen
 */
export function AppEffects() {
  const signedIn = useAuthStore((s) => s.status === 'signedIn');
  const prefs = useSettingsStore((s) => s.preferences);
  const prefsRef = useRef(prefs);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  const onReconnect = useCallback(() => {
    if (useAuthStore.getState().status === 'signedIn') void syncNow();
  }, []);
  useNetworkMonitor(onReconnect);

  useEffect(() => {
    setSyncEnabled(signedIn);
    if (!signedIn) {
      setLocalWriteHook(null);
      return;
    }
    setLocalWriteHook(() => scheduleSync());
    void refreshPendingCount();
    void syncNow();

    endpoints.preferences
      .get()
      .then((p) => useSettingsStore.getState().setPreferences(p))
      .catch(() => undefined);

    const interval = setInterval(() => void syncNow(), 120_000);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncNow();
        void reconcileNotifications(prefsRef.current);
      }
    });
    return () => {
      clearInterval(interval);
      appState.remove();
    };
  }, [signedIn]);

  // Re-plan local notifications when relevant data or briefing preferences change.
  useEffect(() => {
    if (!signedIn) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void reconcileNotifications(prefsRef.current).catch(() => undefined), 800);
    };
    run();
    const unsub = subscribeToChanges((types) => {
      if (types.some((t) => SCHEDULE_TYPES.has(t))) run();
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [signedIn, prefs.briefings]);

  // Notification taps open the related screen.
  useEffect(() => {
    if (!signedIn) return;
    const go = (n: Notifications.Notification) => {
      const url = (n.request.content.data as Record<string, unknown> | undefined)?.url;
      if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
    };
    // The tap that launched the app is handled once, then cleared, so a later
    // sign-in (possibly as someone else) doesn't replay it.
    const last = Notifications.getLastNotificationResponse();
    if (last?.notification) {
      go(last.notification);
      Notifications.clearLastNotificationResponse();
    }
    const sub = Notifications.addNotificationResponseReceivedListener((r) => go(r.notification));
    return () => sub.remove();
  }, [signedIn]);

  // Refresh the profile once online. A revoked session triggers the client's
  // session-expired handler (sign-out); being offline is ignored.
  useEffect(() => {
    if (!signedIn) return;
    endpoints.auth
      .me()
      .then((u) => useAuthStore.getState().setUser(u))
      .catch(() => undefined);
  }, [signedIn]);

  return null;
}
