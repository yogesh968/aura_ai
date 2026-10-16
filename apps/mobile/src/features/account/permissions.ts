import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import Storage from 'expo-sqlite/kv-store';
import { endpoints } from '@/lib/api/endpoints';

export type PermStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable';

interface PermissionLike {
  status: string;
  granted?: boolean;
}

export function toPermStatus(p: PermissionLike | null | undefined): PermStatus {
  if (!p) return 'unavailable';
  if (p.granted || p.status === 'granted') return 'granted';
  if (p.status === 'denied') return 'denied';
  return 'undetermined';
}

/**
 * Calendar and contacts are native modules that may be missing (e.g. Expo Go
 * for calendar in SDK 57), so they're loaded lazily and failures map to
 * 'unavailable' instead of crashing.
 */
type CalendarModule = typeof import('expo-calendar');
type ContactsModule = typeof import('expo-contacts');

function loadCalendar(): CalendarModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-calendar') as CalendarModule;
  } catch {
    return null;
  }
}

function loadContacts(): ContactsModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-contacts') as ContactsModule;
  } catch {
    return null;
  }
}

export async function calendarStatus(request = false): Promise<PermStatus> {
  const cal = loadCalendar();
  if (!cal) return 'unavailable';
  try {
    return toPermStatus(request ? await cal.requestCalendarPermissions() : await cal.getCalendarPermissions());
  } catch {
    return 'unavailable';
  }
}

export async function contactsStatus(request = false): Promise<PermStatus> {
  const c = loadContacts();
  if (!c) return 'unavailable';
  try {
    return toPermStatus(request ? await c.requestPermissionsAsync() : await c.getPermissionsAsync());
  } catch {
    return 'unavailable';
  }
}

export async function locationStatus(request = false): Promise<PermStatus> {
  try {
    return toPermStatus(request ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync());
  } catch {
    return 'unavailable';
  }
}

// ---- Push notifications (automation results) ----------------------------------

const PUSH_KEY = 'aura.pushRegistered';

export function easProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

export async function isPushRegistered(): Promise<boolean> {
  return (await Storage.getItem(PUSH_KEY).catch(() => null)) === '1';
}

/** Register this device for push. Requires an EAS project id, notification permission and a dev/production build. */
export async function enablePush(): Promise<void> {
  const projectId = easProjectId();
  if (!projectId) throw new Error('Push needs an EAS project id in app.json (extra.eas.projectId).');
  const perm = await Notifications.getPermissionsAsync();
  const status = perm.status === 'granted' ? perm.status : (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') throw new Error('Allow notifications first.');
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  await endpoints.account.setPushToken(token.data);
  await Storage.setItem(PUSH_KEY, '1');
}

export async function disablePush(): Promise<void> {
  await endpoints.account.clearPushToken();
  await Storage.removeItem(PUSH_KEY);
}
