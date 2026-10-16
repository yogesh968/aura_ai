import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { endpoints } from '@/lib/api/endpoints';
import { useAuthStore } from '@/lib/auth/store';

/**
 * Sign out (optionally everywhere). The auth store removes every device-side
 * trace: local data, scheduled notifications, cached preferences, queued
 * preference edits and the push registration.
 */
export async function signOutAndClean(opts: { everywhere?: boolean } = {}) {
  await useAuthStore.getState().signOut(opts);
}

/** Download the full data export from the server and open the share sheet. */
export async function exportAllData(): Promise<'shared' | 'saved'> {
  const json = await endpoints.account.exportAll();
  const file = new File(Paths.cache, `aura-export-${new Date().toISOString().slice(0, 10)}.json`);
  file.create({ overwrite: true });
  file.write(json);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Export AURA data' });
    return 'shared';
  }
  return 'saved';
}

/** Permanently delete the account on the server, then remove everything from this device. */
export async function deleteAccountEverywhere() {
  await endpoints.account.delete();
  // The account no longer exists, so skip server calls (they would only 401).
  await useAuthStore.getState().signOut({ localOnly: true });
}
