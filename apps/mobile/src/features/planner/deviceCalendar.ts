import * as Calendar from 'expo-calendar';
import type { CalendarEvent } from '@aura/shared';

/**
 * Phone calendar integration (expo-calendar SDK 57 class-based API).
 * The module is not available in Expo Go, so every call is guarded and
 * failures are reported honestly instead of pretending success.
 */

export class DeviceCalendarError extends Error {}

const DEV_BUILD_HINT = 'Phone calendar access needs the AURA development build (it is not available in Expo Go).';

async function ensurePermission() {
  let res;
  try {
    res = await Calendar.requestCalendarPermissions();
  } catch {
    throw new DeviceCalendarError(DEV_BUILD_HINT);
  }
  if (!res.granted) throw new DeviceCalendarError('Calendar permission is off. Allow it in system settings to use your phone calendar.');
}

async function writableCalendar() {
  const cals = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  const writable = cals.filter((c) => c.allowsModifications);
  const pick = writable.find((c) => c.isPrimary) ?? writable[0];
  if (!pick) throw new DeviceCalendarError('No writable calendar was found on this phone.');
  return pick;
}

/** Copy an AURA event into the phone's default writable calendar. Returns the calendar's name. */
export async function addEventToPhoneCalendar(e: CalendarEvent): Promise<string> {
  await ensurePermission();
  try {
    const cal = await writableCalendar();
    const start = new Date(e.startAt);
    const end = e.endAt ? new Date(e.endAt) : new Date(start.getTime() + (e.allDay ? 86_400_000 : 3_600_000));
    await cal.createEvent({
      title: e.title,
      startDate: start,
      endDate: end,
      allDay: e.allDay,
      location: e.location ?? undefined,
      notes: e.notes ?? undefined,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      alarms: e.reminderMinutesBefore != null ? [{ relativeOffset: -e.reminderMinutesBefore }] : [],
    });
    return cal.title;
  } catch (err) {
    if (err instanceof DeviceCalendarError) throw err;
    throw new DeviceCalendarError(err instanceof Error && err.message ? `Couldn't add to the phone calendar: ${err.message}` : DEV_BUILD_HINT);
  }
}

export interface PhoneEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location: string | null;
}

/** Read-only list of phone calendar events in a range (only used when the user enabled it). */
export async function listPhoneEvents(from: Date, to: Date): Promise<PhoneEvent[]> {
  await ensurePermission();
  try {
    const cals = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
    if (cals.length === 0) return [];
    const events = await Calendar.listEvents(cals, from, to);
    return events.map((ev) => ({
      id: ev.id,
      title: ev.title || '(No title)',
      start: new Date(ev.startDate),
      end: new Date(ev.endDate),
      allDay: Boolean((ev as { allDay?: boolean }).allDay),
      location: ev.location ?? null,
    }));
  } catch (err) {
    throw new DeviceCalendarError(err instanceof Error && err.message ? `Couldn't read the phone calendar: ${err.message}` : DEV_BUILD_HINT);
  }
}
