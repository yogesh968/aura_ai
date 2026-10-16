import { Platform } from 'react-native';
import Storage from 'expo-sqlite/kv-store';

/**
 * Backend base URL.
 * - EXPO_PUBLIC_API_URL wins (set it in apps/mobile/.env for physical devices,
 *   e.g. http://192.168.1.20:4000, or your HTTPS production URL).
 * - Android emulator default: 10.0.2.2 maps to the host machine.
 * - Users can override it in Settings → Server (stored on device).
 */
const DEFAULT_URL =
  process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');

const OVERRIDE_KEY = 'aura.apiBaseUrl';
let current = DEFAULT_URL;

export async function loadApiBaseUrl() {
  try {
    const saved = await Storage.getItem(OVERRIDE_KEY);
    if (saved) current = saved;
  } catch {
    /* keep default */
  }
  return current;
}

export function getApiBaseUrl() {
  return current;
}

export function getDefaultApiBaseUrl() {
  return DEFAULT_URL;
}

export async function setApiBaseUrl(url: string | null) {
  const clean = url?.trim().replace(/\/+$/, '') || null;
  if (clean && !/^https?:\/\/[^\s]+$/i.test(clean)) throw new Error('Enter a URL starting with http:// or https://');
  current = clean ?? DEFAULT_URL;
  if (clean) await Storage.setItem(OVERRIDE_KEY, clean);
  else await Storage.removeItem(OVERRIDE_KEY);
}
