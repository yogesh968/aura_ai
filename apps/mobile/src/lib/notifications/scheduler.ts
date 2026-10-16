import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { nextOccurrence, parseTimeOfDay, type Preferences } from '@aura/shared';
import { listEntities } from '@/lib/db/repo';

/**
 * Local notifications for reminders, task alerts, event alerts, bill
 * reminders and daily briefings. These are scheduled on the device from the
 * local database, so they fire even when the phone is offline.
 *
 * Strategy: compute the desired set for the next 14 days (capped), and
 * reconcile with what's scheduled whenever data or preferences change.
 */
const WINDOW_DAYS = 14;
const MAX_SCHEDULED = 60;
const SOURCE = 'aura';

export const CHANNELS = { reminders: 'reminders', briefings: 'briefings' } as const;

export async function setupNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    // Channels must exist before the permission prompt on Android 13+.
    await Notifications.setNotificationChannelAsync(CHANNELS.reminders, {
      name: 'Reminders & alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#7C5CFF',
    });
    await Notifications.setNotificationChannelAsync(CHANNELS.briefings, {
      name: 'Daily briefings',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export async function notificationPermission(): Promise<{ status: PermissionStatus; canAskAgain: boolean }> {
  const p = await Notifications.getPermissionsAsync();
  return { status: p.status as PermissionStatus, canAskAgain: p.canAskAgain };
}

export async function requestNotificationPermission(): Promise<PermissionStatus> {
  const p = await Notifications.requestPermissionsAsync();
  return p.status as PermissionStatus;
}

interface Desired {
  key: string;
  title: string;
  body: string;
  date?: Date;
  daily?: { hour: number; minute: number };
  channel: string;
  url: string;
}

const deviceTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

function occurrencesWithin(anchorIso: string, recurrence: Parameters<typeof nextOccurrence>[1], from: Date, to: Date, max = 14): Date[] {
  const anchor = new Date(anchorIso);
  if (recurrence === 'none') return anchor > from && anchor <= to ? [anchor] : [];
  const out: Date[] = [];
  let cursor = new Date(from.getTime());
  for (let i = 0; i < max; i++) {
    const next = nextOccurrence(anchor, recurrence, cursor, deviceTz());
    if (!next || next > to) break;
    out.push(next);
    cursor = next;
  }
  return out;
}

async function desiredNotifications(prefs: Preferences, now: Date): Promise<Desired[]> {
  const to = new Date(now.getTime() + WINDOW_DAYS * 86_400_000);
  const [reminders, tasks, events, bills] = await Promise.all([
    listEntities('reminder'),
    listEntities('task'),
    listEntities('event'),
    listEntities('recurringPayment'),
  ]);
  const out: Desired[] = [];

  for (const r of reminders) {
    if (r.done) continue;
    for (const at of occurrencesWithin(r.remindAt, r.recurrence, now, to)) {
      out.push({ key: `r:${r.id}:${at.getTime()}`, title: r.title, body: r.notes ?? 'Reminder', date: at, channel: CHANNELS.reminders, url: `/reminder/${r.id}` });
    }
  }
  for (const t of tasks) {
    if (!t.remindAt || t.status === 'done' || t.status === 'cancelled') continue;
    const at = new Date(t.remindAt);
    if (at > now && at <= to) {
      out.push({ key: `t:${t.id}`, title: t.title, body: t.dueAt ? 'Task due soon' : 'Task reminder', date: at, channel: CHANNELS.reminders, url: `/task/${t.id}` });
    }
  }
  for (const e of events) {
    if (e.reminderMinutesBefore == null) continue;
    const offset = e.allDay ? 0 : e.reminderMinutesBefore * 60_000;
    for (const start of occurrencesWithin(e.startAt, e.recurrence, new Date(now.getTime() + offset), new Date(to.getTime() + offset))) {
      let at = new Date(start.getTime() - offset);
      if (e.allDay) at = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 8, 0);
      if (at <= now) continue;
      const title = e.kind === 'birthday' ? `🎂 ${e.title}` : e.title;
      const body = e.allDay ? 'Today' : e.reminderMinutesBefore === 0 ? 'Starting now' : `In ${e.reminderMinutesBefore} minutes${e.location ? ` · ${e.location}` : ''}`;
      out.push({ key: `e:${e.id}:${start.getTime()}`, title, body, date: at, channel: CHANNELS.reminders, url: `/event/${e.id}` });
    }
  }
  for (const b of bills) {
    if (!b.active) continue;
    const due = new Date(b.nextDueAt);
    const at = new Date(due.getFullYear(), due.getMonth(), due.getDate() - b.remindDaysBefore, 9, 0);
    if (at > now && at <= to) {
      out.push({ key: `b:${b.id}:${due.getTime()}`, title: `${b.name} due ${b.remindDaysBefore === 0 ? 'today' : `in ${b.remindDaysBefore} day${b.remindDaysBefore === 1 ? '' : 's'}`}`, body: 'Tap to review your bills', date: at, channel: CHANNELS.reminders, url: '/finance' });
    }
  }

  out.sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));
  const timed = out.slice(0, MAX_SCHEDULED - 2);

  if (prefs.briefings.morningEnabled) {
    timed.push({ key: 'brief:morning', title: 'Your morning briefing is ready', body: "Today's plan, weather and priorities", daily: parseTimeOfDay(prefs.briefings.morningTime), channel: CHANNELS.briefings, url: '/briefing?kind=morning' });
  }
  if (prefs.briefings.eveningEnabled) {
    timed.push({ key: 'brief:evening', title: 'Evening wrap-up', body: 'See what you got done and preview tomorrow', daily: parseTimeOfDay(prefs.briefings.eveningTime), channel: CHANNELS.briefings, url: '/briefing?kind=evening' });
  }
  return timed;
}

let lastSignature = '';
let running: Promise<number> | null = null;

/** Bring scheduled notifications in line with local data. Returns the number scheduled. */
export function reconcileNotifications(prefs: Preferences, opts: { force?: boolean } = {}): Promise<number> {
  running ??= (async () => {
    try {
      const { status } = await notificationPermission();
      if (status !== 'granted') return 0;
      const desired = await desiredNotifications(prefs, new Date());
      const signature = desired.map((d) => `${d.key}|${d.title}|${d.body}|${d.date?.getTime() ?? `${d.daily?.hour}:${d.daily?.minute}`}`).join('\n');
      if (!opts.force && signature === lastSignature) return desired.length;

      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      await Promise.all(
        scheduled
          .filter((n) => (n.content.data as Record<string, unknown> | undefined)?.source === SOURCE)
          .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
      );
      for (const d of desired) {
        await Notifications.scheduleNotificationAsync({
          content: { title: d.title, body: d.body, data: { source: SOURCE, url: d.url, key: d.key }, sound: 'default' },
          trigger: d.daily
            ? { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: d.daily.hour, minute: d.daily.minute, channelId: d.channel }
            : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: d.date!, channelId: d.channel },
        });
      }
      lastSignature = signature;
      return desired.length;
    } finally {
      running = null;
    }
  })();
  return running;
}

export async function cancelAllAuraNotifications() {
  lastSignature = '';
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => (n.content.data as Record<string, unknown> | undefined)?.source === SOURCE)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/** Show something immediately (e.g. an automation result fetched from the inbox). */
export async function presentNow(title: string, body: string, url?: string) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { source: 'aura-inbox', url } },
    trigger: null,
  });
}
