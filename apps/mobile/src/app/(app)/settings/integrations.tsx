import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, View } from 'react-native';
import { Button, Card, Icon, PermissionCard, Screen, ScreenHeader, SectionHeader, Text, ToggleRow } from '@/components/ui';
import { errorMessage } from '@/lib/api/client';
import { notificationPermission, reconcileNotifications, requestNotificationPermission } from '@/lib/notifications/scheduler';
import { useSettingsStore } from '@/lib/settings';
import { toast } from '@/lib/toast';
import { voiceAvailability } from '@/lib/voice/recognition';
import {
  calendarStatus,
  contactsStatus,
  disablePush,
  easProjectId,
  enablePush,
  isPushRegistered,
  locationStatus,
  type PermStatus,
} from '@/features/account/permissions';

interface Statuses {
  notifications: PermStatus;
  calendar: PermStatus;
  contacts: PermStatus;
  location: PermStatus;
}

export default function IntegrationsScreen() {
  const prefs = useSettingsStore((s) => s.preferences);
  const deviceCalendarSync = useSettingsStore((s) => s.deviceCalendarSync);
  const setDeviceCalendarSync = useSettingsStore((s) => s.setDeviceCalendarSync);
  const [s, setS] = useState<Statuses>({ notifications: 'undetermined', calendar: 'undetermined', contacts: 'undetermined', location: 'undetermined' });
  const [push, setPush] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const voice = voiceAvailability();

  const load = useCallback(async () => {
    const [n, calendar, contacts, location, pushOn] = await Promise.all([
      notificationPermission()
        .then((p) => p.status as PermStatus)
        .catch(() => 'unavailable' as const),
      calendarStatus(),
      contactsStatus(),
      locationStatus(),
      isPushRegistered(),
    ]);
    return { statuses: { notifications: n, calendar, contacts, location } as Statuses, pushOn };
  }, []);

  useEffect(() => {
    let active = true;
    const apply = () =>
      void load().then((r) => {
        if (!active) return;
        setS(r.statuses);
        setPush(r.pushOn);
      });
    apply();
    // Permissions may change in system settings while we're away.
    const sub = AppState.addEventListener('change', (st) => st === 'active' && apply());
    return () => {
      active = false;
      sub.remove();
    };
  }, [load]);

  const reschedule = async () => {
    setBusy('reschedule');
    try {
      const n = await reconcileNotifications(prefs, { force: true });
      toast.success(`${n} notification${n === 1 ? '' : 's'} scheduled for the next two weeks`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const togglePush = async (on: boolean) => {
    setBusy('push');
    try {
      if (on) await enablePush();
      else await disablePush();
      setPush(on);
      toast.success(on ? 'Push notifications enabled' : 'Push notifications disabled');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const revokeHint = (status: PermStatus) =>
    status === 'granted' ? (
      <Button title="Manage in system settings" variant="ghost" size="sm" icon="open-outline" onPress={() => void Linking.openSettings()} style={{ alignSelf: 'flex-start' }} />
    ) : null;

  return (
    <Screen header={<ScreenHeader title="Integrations & permissions" />}>
      <Text variant="caption" color="textMuted">
        AURA asks for each permission only when a feature needs it. To revoke one, use your phone’s settings — AURA keeps working without it.
      </Text>

      <SectionHeader title="Notifications" />
      <View style={{ gap: 8 }}>
        <PermissionCard
          icon="notifications-outline"
          title="Notifications"
          reason="Reminders, task and event alerts, bill reminders and daily briefings are scheduled on this phone and work offline."
          status={s.notifications}
          onRequest={async () => {
            const st = await requestNotificationPermission();
            setS((x) => ({ ...x, notifications: st }));
            if (st === 'granted') void reconcileNotifications(prefs, { force: true });
          }}
        />
        {s.notifications === 'granted' ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Re-schedule now" size="sm" variant="soft" icon="refresh" loading={busy === 'reschedule'} onPress={reschedule} />
            {revokeHint(s.notifications)}
          </View>
        ) : null}
        <Card style={{ gap: 8 }}>
          <Text variant="subheading">Push from the server</Text>
          {easProjectId() ? (
            <ToggleRow
              label="Automation results as push"
              description="Your server can notify this phone when an automation runs. Requires the development or production build."
              value={push}
              disabled={busy === 'push'}
              onChange={(v) => void togglePush(v)}
            />
          ) : (
            <Text variant="caption" color="textMuted">
              Server push needs an EAS project id configured in app.json. Until then, automation results appear in the in-app inbox.
            </Text>
          )}
        </Card>
      </View>

      <SectionHeader title="Voice" />
      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Icon name="mic-outline" size={22} color={voice === 'available' ? 'success' : 'primary'} />
          <Text variant="subheading" style={{ flex: 1 }}>
            Microphone & speech recognition
          </Text>
        </View>
        <Text variant="caption" color="textMuted">
          {voice === 'available'
            ? 'Available. The microphone permission is requested the first time you tap the mic and is used only while you are talking to AURA.'
            : voice === 'needs-dev-build'
              ? 'Voice input needs the AURA development build — it is not included in Expo Go. Spoken replies still work.'
              : 'No speech recognition service was found on this phone. Install or enable the Google app’s speech services to use voice input.'}
        </Text>
        {voice === 'available' ? revokeHint('granted') : null}
      </Card>

      <SectionHeader title="Calendar" />
      <View style={{ gap: 8 }}>
        <PermissionCard
          icon="calendar-outline"
          title="Phone calendar"
          reason="Optional: add AURA events to your phone calendar and show your phone's events in your agenda."
          status={s.calendar}
          onRequest={async () => {
            const st = await calendarStatus(true);
            setS((x) => ({ ...x, calendar: st }));
          }}
        />
        {s.calendar === 'unavailable' ? (
          <Text variant="small" color="textSubtle">
            Phone calendar access needs the AURA development build (it is not supported in Expo Go).
          </Text>
        ) : null}
        {s.calendar === 'granted' ? (
          <Card>
            <ToggleRow label="Use phone calendar" description="Show phone events in your agenda and allow adding events to it" value={deviceCalendarSync} onChange={setDeviceCalendarSync} />
            {revokeHint(s.calendar)}
          </Card>
        ) : null}
      </View>

      <SectionHeader title="Contacts" />
      <View style={{ gap: 8 }}>
        <PermissionCard
          icon="people-outline"
          title="Contacts"
          reason="Only used when you choose a recipient for a message or call draft. AURA never uploads your contact list."
          status={s.contacts}
          onRequest={async () => {
            const st = await contactsStatus(true);
            setS((x) => ({ ...x, contacts: st }));
          }}
        />
        {revokeHint(s.contacts)}
      </View>

      <SectionHeader title="Location" />
      <View style={{ gap: 8 }}>
        <PermissionCard
          icon="location-outline"
          title="Location"
          reason="Used for local weather when you choose “Use my location”. Your home city can also be typed instead."
          status={s.location}
          onRequest={async () => {
            const st = await locationStatus(true);
            setS((x) => ({ ...x, location: st }));
          }}
        />
        {revokeHint(s.location)}
      </View>

      <SectionHeader title="Coming later" />
      <Card tone="alt" style={{ gap: 6 }}>
        <Text variant="body">Share to AURA</Text>
        <Text variant="caption" color="textMuted">
          Sending text or files to AURA from Android’s share sheet is planned but not available yet. For now, copy text into a chat or upload files in Documents.
        </Text>
      </Card>
    </Screen>
  );
}
