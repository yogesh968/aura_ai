import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { getCalendars, getLocales } from 'expo-localization';
import { defaultPreferences, isValidTimeZone, type Preferences } from '@aura/shared';
import {
  Button,
  Card,
  ChipGroup,
  DateTimeField,
  Icon,
  PermissionCard,
  ProgressBar,
  Screen,
  SectionHeader,
  SelectRow,
  SelectSheet,
  Text,
  TextField,
  ToggleRow,
} from '@/components/ui';
import { endpoints } from '@/lib/api/endpoints';
import { isNetworkError } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/store';
import { useSettingsStore } from '@/lib/settings';
import { toast } from '@/lib/toast';
import { notificationPermission, requestNotificationPermission, type PermissionStatus } from '@/lib/notifications/scheduler';
import { voiceAvailability } from '@/lib/voice/recognition';
import { LANGUAGE_OPTIONS, TONE_OPTIONS, dateToTime, languageLabel, normalizeCurrency, savePreferences, timeToDate } from '@/features/account/prefs';
import { LocationPicker } from '@/features/account/LocationPicker';

const STEPS = ['About you', 'Language', 'Your day', 'Permissions'] as const;

function deviceDefaults(): Partial<Preferences> {
  const out: Partial<Preferences> = {};
  try {
    const tz = getCalendars()[0]?.timeZone;
    if (tz && isValidTimeZone(tz)) out.timezone = tz;
  } catch {
    /* keep server default */
  }
  try {
    const cur = normalizeCurrency(getLocales()[0]?.currencyCode);
    if (cur) out.currency = cur;
  } catch {
    /* keep default */
  }
  return out;
}

export default function SetupScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const stored = useSettingsStore((s) => s.preferences);
  const setOnboardingComplete = useSettingsStore((s) => s.setOnboardingComplete);

  const [step, setStep] = useState(0);
  const [name, setName] = useState(user?.isGuest || user?.name === 'Guest' ? '' : (user?.name ?? ''));
  const [prefs, setPrefs] = useState<Preferences>(() => ({ ...stored, ...deviceDefaults() }));
  const [langSheet, setLangSheet] = useState(false);
  const [notif, setNotif] = useState<PermissionStatus>('undetermined');
  const [finishing, setFinishing] = useState(false);

  const touched = useRef(false);

  useEffect(() => {
    notificationPermission()
      .then((p) => setNotif(p.status))
      .catch(() => undefined);
    // A returning account already has preferences on the server: start from those so
    // finishing setup never overwrites them with defaults. Device-detected timezone and
    // currency only fill in a brand-new account.
    endpoints.preferences
      .get()
      .then((server) => {
        if (touched.current) return;
        const isFresh = JSON.stringify(server) === JSON.stringify(defaultPreferences);
        setPrefs(isFresh ? { ...server, ...deviceDefaults() } : server);
      })
      .catch(() => undefined);
  }, []);

  const patch = (p: Partial<Preferences>) => {
    touched.current = true;
    setPrefs((cur) => ({ ...cur, ...p }));
  };

  const finish = async () => {
    setFinishing(true);
    try {
      if (name.trim() && name.trim() !== user?.name) {
        try {
          setUser(await endpoints.auth.updateMe({ name: name.trim() }));
        } catch (e) {
          if (!isNetworkError(e)) toast.error("Couldn't save your name — you can change it in Settings.");
        }
      }
      const result = await savePreferences({
        assistantName: prefs.assistantName.trim() || 'Aura',
        language: prefs.language,
        tone: prefs.tone,
        briefings: prefs.briefings,
        timezone: prefs.timezone,
        currency: prefs.currency,
        location: prefs.location,
      });
      if (result === 'queued') toast.info("You're offline — your preferences are saved here and will sync when you're back online.");
      setOnboardingComplete(true);
      router.replace('/');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save your preferences");
    } finally {
      setFinishing(false);
    }
  };

  const next = () => (step < STEPS.length - 1 ? setStep(step + 1) : void finish());

  return (
    <Screen
      footer={
        <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 12 }}>
          {step > 0 ? <Button title="Back" variant="secondary" onPress={() => setStep(step - 1)} style={{ flex: 1 }} /> : null}
          <Button title={step === STEPS.length - 1 ? 'Finish' : 'Continue'} loading={finishing} onPress={next} style={{ flex: 2 }} iconRight={step === STEPS.length - 1 ? 'checkmark' : 'arrow-forward'} />
        </View>
      }
    >
      <View style={{ gap: 8, marginTop: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="overline" color="textMuted">
            {`Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}`}
          </Text>
          {step < STEPS.length - 1 ? <Button title="Skip" variant="ghost" size="sm" onPress={() => setStep(step + 1)} /> : null}
        </View>
        <ProgressBar value={(step + 1) / STEPS.length} label="Setup progress" />
      </View>

      <Animated.View key={step} entering={FadeInRight.duration(220)} style={{ gap: 16, marginTop: 24 }}>
        {step === 0 ? (
          <>
            <Text variant="title" accessibilityRole="header">
              {"Let's make AURA yours"}
            </Text>
            <TextField label="What should I call you?" icon="person-outline" value={name} onChangeText={setName} placeholder="Your name" autoComplete="name" />
            <TextField
              label="Name your assistant"
              icon="sparkles-outline"
              value={prefs.assistantName}
              onChangeText={(t) => patch({ assistantName: t.slice(0, 30) })}
              placeholder="Aura"
              helper="You can call it anything — it will answer to this name."
            />
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Text variant="title" accessibilityRole="header">
              How should we talk?
            </Text>
            <SelectRow label="Reply language" icon="language-outline" value={languageLabel(prefs.language)} onPress={() => setLangSheet(true)} />
            <SectionHeader title="Tone" />
            <ChipGroup options={TONE_OPTIONS.map((t) => ({ value: t.value, label: t.label }))} value={prefs.tone} onChange={(tone) => patch({ tone })} />
            <Text variant="caption" color="textMuted">
              {TONE_OPTIONS.find((t) => t.value === prefs.tone)?.description}
            </Text>
            <Card tone="primary" style={{ flexDirection: 'row', gap: 10 }}>
              <Icon name="mic-outline" size={20} color="primary" />
              <Text variant="caption" style={{ flex: 1 }}>
                Voice works in English, Hindi and Hinglish. The microphone is only requested the first time you tap the mic.
              </Text>
            </Card>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text variant="title" accessibilityRole="header">
              Your daily rhythm
            </Text>
            <ToggleRow
              label="Morning briefing"
              description="Agenda, weather and priorities"
              icon="sunny-outline"
              value={prefs.briefings.morningEnabled}
              onChange={(v) => patch({ briefings: { ...prefs.briefings, morningEnabled: v } })}
            />
            {prefs.briefings.morningEnabled ? (
              <DateTimeField
                label="Morning time"
                mode="time"
                icon="time-outline"
                clearable={false}
                value={timeToDate(prefs.briefings.morningTime)}
                onChange={(d) => d && patch({ briefings: { ...prefs.briefings, morningTime: dateToTime(d) } })}
              />
            ) : null}
            <ToggleRow
              label="Evening summary"
              description="What you finished and what's next"
              icon="moon-outline"
              value={prefs.briefings.eveningEnabled}
              onChange={(v) => patch({ briefings: { ...prefs.briefings, eveningEnabled: v } })}
            />
            {prefs.briefings.eveningEnabled ? (
              <DateTimeField
                label="Evening time"
                mode="time"
                icon="time-outline"
                clearable={false}
                value={timeToDate(prefs.briefings.eveningTime)}
                onChange={(d) => d && patch({ briefings: { ...prefs.briefings, eveningTime: dateToTime(d) } })}
              />
            ) : null}
            <SectionHeader title="Region" />
            <Card tone="alt" style={{ gap: 6 }}>
              <Text variant="caption" color="textMuted">{`Time zone: ${prefs.timezone}`}</Text>
              <Text variant="caption" color="textMuted">{`Currency: ${prefs.currency}`}</Text>
              <Text variant="small" color="textSubtle">
                Detected from your phone. Change them anytime in Settings → Assistant.
              </Text>
            </Card>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Text variant="title" accessibilityRole="header">
              A few permissions
            </Text>
            <Text variant="caption" color="textMuted">
              All optional — AURA works without them, and you can change them later in Settings.
            </Text>
            <PermissionCard
              icon="notifications-outline"
              title="Notifications"
              reason="So reminders, task alerts and your daily briefing reach you on time — even offline."
              status={notif}
              onRequest={async () => setNotif(await requestNotificationPermission())}
            />
            <Card style={{ flexDirection: 'row', gap: 10 }}>
              <Icon name="mic-outline" size={22} color="primary" />
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="subheading">Microphone</Text>
                <Text variant="caption" color="textMuted">
                  {voiceAvailability() === 'needs-dev-build'
                    ? 'Voice input needs the AURA development build; it is not available in Expo Go. You can still type.'
                    : voiceAvailability() === 'no-recognizer'
                      ? 'No speech recognition service was found on this phone. You can still type.'
                      : 'Asked the first time you tap the mic, and used only while you talk to AURA.'}
                </Text>
              </View>
            </Card>
            <SectionHeader title="Home location (optional)" />
            <Text variant="caption" color="textMuted">
              Used for local weather in your briefing. Search a city or use your current location.
            </Text>
            <LocationPicker value={prefs.location} onChange={(location) => patch({ location })} />
          </>
        ) : null}
      </Animated.View>

      <SelectSheet
        visible={langSheet}
        onClose={() => setLangSheet(false)}
        title="Reply language"
        options={LANGUAGE_OPTIONS}
        value={prefs.language}
        onSelect={(language) => patch({ language })}
      />
    </Screen>
  );
}
