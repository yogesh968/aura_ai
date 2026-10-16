import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';
import type { AuthResponse, User } from '@aura/shared';
import { endpoints } from '@/lib/api/endpoints';
import { isNetworkError, refreshSession, registerTokenProvider } from '@/lib/api/client';
import { getMeta, setMeta, wipeLocalData } from '@/lib/db/database';
import { queryClient } from '@/lib/data';
import { resetSyncCursor } from '@/lib/sync/engine';
import { cancelAllAuraNotifications } from '@/lib/notifications/scheduler';
import { useSettingsStore } from '@/lib/settings';

/**
 * Session management. Tokens live only in SecureStore (Android Keystore-
 * backed) and memory; the cached user profile lives in the kv store so the
 * app opens signed-in and fully usable offline.
 */
const ACCESS_KEY = 'aura.accessToken';
const REFRESH_KEY = 'aura.refreshToken';
const USER_KEY = 'aura.user';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: Status;
  user: User | null;
  bootstrap: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  continueAsGuest: () => Promise<void>;
  claimGuest: (name: string, email: string, password: string) => Promise<void>;
  setUser: (user: User) => void;
  /** Ends the session and removes this account's data from the device. */
  signOut: (opts?: { everywhere?: boolean; localOnly?: boolean }) => Promise<void>;
}

let accessToken: string | null = null;

async function storeSession(res: AuthResponse) {
  accessToken = res.accessToken;
  await SecureStore.setItemAsync(ACCESS_KEY, res.accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, res.refreshToken);
  await Storage.setItem(USER_KEY, JSON.stringify(res.user));
}

async function clearSession() {
  accessToken = null;
  await SecureStore.deleteItemAsync(ACCESS_KEY).catch(() => undefined);
  await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => undefined);
  await Storage.removeItem(USER_KEY).catch(() => undefined);
}

/** Device-side keys owned by feature modules that must not outlive an account. */
const ACCOUNT_SCOPED_KV_KEYS = ['aura.pendingPreferences', 'aura.pushRegistered'];

/**
 * Remove an account's traces from this device: scheduled notifications (their
 * titles are private), cached preferences (incl. home location), queued
 * preference edits, the push flag and, unless `keepData`, the local database.
 */
async function cleanDevice(opts: { keepData?: boolean } = {}) {
  await cancelAllAuraNotifications().catch(() => undefined);
  await Promise.all(ACCOUNT_SCOPED_KV_KEYS.map((k) => Storage.removeItem(k).catch(() => undefined)));
  const settings = useSettingsStore.getState();
  settings.reset();
  settings.setOnboardingComplete(false);
  if (!opts.keepData) {
    await wipeLocalData();
    queryClient.clear();
  }
}

/** Best effort: stop pushes to this device, then revoke the session(s) on the server. */
async function endServerSession(everywhere: boolean) {
  try {
    if (await Storage.getItem('aura.pushRegistered')) await endpoints.account.clearPushToken();
  } catch {
    /* best effort */
  }
  try {
    const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
    if (everywhere) await endpoints.auth.logoutAll();
    else if (refresh) await endpoints.auth.logout(refresh);
  } catch {
    /* the local session is removed regardless */
  }
}

/** If a different account signs in on this device, the previous account's local data is removed first. */
async function adoptUser(user: User) {
  const owner = await getMeta('owner_user_id');
  if (owner && owner !== user.id) await cleanDevice();
  if (owner !== user.id) {
    await resetSyncCursor();
    await setMeta('owner_user_id', user.id);
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  user: null,

  bootstrap: async () => {
    try {
      const [refresh, rawUser, access] = await Promise.all([
        SecureStore.getItemAsync(REFRESH_KEY),
        Storage.getItem(USER_KEY),
        SecureStore.getItemAsync(ACCESS_KEY),
      ]);
      if (refresh && rawUser) {
        accessToken = access;
        set({ status: 'signedIn', user: JSON.parse(rawUser) as User });
        return;
      }
    } catch {
      /* fall through to signed out */
    }
    set({ status: 'signedOut', user: null });
  },

  signIn: async (email, password) => {
    const res = await endpoints.auth.login({ email, password });
    await adoptUser(res.user);
    await storeSession(res);
    set({ status: 'signedIn', user: res.user });
  },

  signUp: async (name, email, password) => {
    const res = await endpoints.auth.register({ name, email, password });
    await adoptUser(res.user);
    await storeSession(res);
    set({ status: 'signedIn', user: res.user });
  },

  continueAsGuest: async () => {
    const res = await endpoints.auth.guest();
    await adoptUser(res.user);
    await storeSession(res);
    set({ status: 'signedIn', user: res.user });
  },

  claimGuest: async (name, email, password) => {
    const res = await endpoints.auth.claim({ name, email, password });
    await storeSession(res);
    set({ user: res.user });
  },

  setUser: (user) => {
    set({ user });
    void Storage.setItem(USER_KEY, JSON.stringify(user));
  },

  signOut: async (opts = {}) => {
    if (!opts.localOnly) await endServerSession(opts.everywhere ?? false);
    await clearSession();
    await cleanDevice();
    set({ status: 'signedOut', user: null });
  },
}));

registerTokenProvider({
  getAccessToken: () => accessToken,
  refresh: async () => {
    const refresh = await SecureStore.getItemAsync(REFRESH_KEY).catch(() => null);
    if (!refresh) return null;
    try {
      const res = await refreshSession(refresh);
      await storeSession(res);
      useAuthStore.getState().setUser(res.user);
      return res.accessToken;
    } catch (e) {
      // Offline: keep the session; requests will fail as network errors.
      if (isNetworkError(e)) throw e;
      return null;
    }
  },
  onSessionExpired: () => {
    // Keep the local database so unsynced edits survive if the same person signs back in
    // (a different account wipes it in adoptUser); remove everything else.
    void clearSession()
      .then(() => cleanDevice({ keepData: true }))
      .finally(() => useAuthStore.setState({ status: 'signedOut', user: null }));
  },
});
