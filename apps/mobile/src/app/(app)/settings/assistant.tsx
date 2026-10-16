import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { getCalendars } from 'expo-localization';
import { isValidTimeZone, type Preferences } from '@aura/shared';
import {
  Button,
  Card,
  ChipGroup,
  DateTimeField,
  Divider,
  Screen,
  ScreenHeader,
  SectionHeader,
  Segmented,
  SelectRow,
  SelectSheet,
  Text,
  TextField,
  ToggleRow,
  type SelectOption,
} from '@/components/ui';
import { useSettingsStore } from '@/lib/settings';
import { toast } from '@/lib/toast';
import { availableVoices, speak, stopSpeaking } from '@/lib/voice/speech';
import { voiceLocale } from '@/lib/voice/recognition';
import { LANGUAGE_OPTIONS, TONE_OPTIONS, dateToTime, languageLabel, normalizeCurrency, savePreferences, timeToDate } from '@/features/account/prefs';
import { LocationPicker } from '@/features/account/LocationPicker';
import { Stepper } from '@/features/account/Stepper';

type Voice = Awaited<ReturnType<typeof availableVoices>>[number];

async function update(patch: Partial<Preferences>) {
  try {
    const r = await savePreferences(patch);
    if (r === 'queued') toast.info('Saved on this phone — will sync when you are online.');
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Couldn't save that setting");
  }
}

export default function AssistantSettingsScreen() {
  const prefs = useSettingsStore((s) => s.preferences);
  const [assistantName, setAssistantName] = useState(prefs.assistantName);
  const [timezone, setTimezone] = useState(prefs.timezone);
  const [tzError, setTzError] = useState<string | null>(null);
  const [currency, setCurrency] = useState(prefs.currency);
  const [currencyError, setCurrencyError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'language' | 'voice' | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);

  useEffect(() => {
    void availableVoices().then(setVoices);
  }, []);

  const locale = voiceLocale(prefs.language);
  const voiceOptions = useMemo<SelectOption<string>[]>(() => {
    const lang = locale.split('-')[0]!;
    const matching = voices.filter((v) => v.language.toLowerCase().startsWith(lang));
    return [
      { value: '__default', label: 'System default', description: `Best available for ${locale}` },
      ...matching.map((v) => ({ value: v.identifier, label: v.name || v.identifier, description: `${v.language}${v.quality === 'Enhanced' ? ' · enhanced' : ''}` })),
    ];
  }, [voices, locale]);
  const currentVoice = voices.find((v) => v.identifier === prefs.voice.voiceId);

  const testVoice = async () => {
    await stopSpeaking();
    const sample =
      prefs.language === 'hi'
        ? `नमस्ते! मैं ${prefs.assistantName} हूँ। आपका दिन शुभ हो।`
        : prefs.language === 'hinglish'
          ? `Hi! Main ${prefs.assistantName} hoon. Aaj ka plan ready hai.`
          : `Hi! I'm ${prefs.assistantName}. Your plan for today is ready.`;
    speak(sample, { language: prefs.language, rate: prefs.voice.rate, pitch: prefs.voice.pitch, voice: prefs.voice.voiceId, onError: () => toast.error('Text-to-speech is not available on this device') });
  };

  const saveTimezone = () => {
    const tz = timezone.trim();
    if (!isValidTimeZone(tz)) {
      setTzError('Unknown time zone. Use a name like Asia/Kolkata.');
      return;
    }
    setTzError(null);
    void update({ timezone: tz });
  };

  const saveCurrency = () => {
    const c = normalizeCurrency(currency);
    if (!c) {
      setCurrencyError('Use a 3-letter code like INR or USD.');
      return;
    }
    setCurrencyError(null);
    setCurrency(c);
    void update({ currency: c });
  };

  return (
    <Screen header={<ScreenHeader title="Assistant & preferences" />}>
      <SectionHeader title="Personality" />
      <Card style={{ gap: 14 }}>
        <TextField
          label="Assistant name"
          icon="sparkles-outline"
          value={assistantName}
          onChangeText={(t) => setAssistantName(t.slice(0, 30))}
          onEndEditing={() => assistantName.trim() && assistantName.trim() !== prefs.assistantName && void update({ assistantName: assistantName.trim() })}
          returnKeyType="done"
        />
        <SelectRow label="Reply language" icon="language-outline" value={languageLabel(prefs.language)} onPress={() => setSheet('language')} />
        <Text variant="small" color="textMuted">
          Tone
        </Text>
        <ChipGroup options={TONE_OPTIONS.map((t) => ({ value: t.value, label: t.label }))} value={prefs.tone} onChange={(tone) => void update({ tone })} />
        <ToggleRow
          label="Web search in chat"
          description="Lets the assistant look up current information with sources. Applies to new conversations."
          icon="globe-outline"
          value={prefs.webSearchEnabled}
          onChange={(v) => void update({ webSearchEnabled: v })}
        />
      </Card>

      <SectionHeader title="Voice" />
      <Card style={{ gap: 4 }}>
        <ToggleRow label="Voice features" description="Mic button and spoken replies" icon="mic-outline" value={prefs.voice.enabled} onChange={(v) => void update({ voice: { ...prefs.voice, enabled: v } })} />
        <ToggleRow
          label="Speak replies automatically"
          description="In voice mode, read answers aloud"
          icon="volume-high-outline"
          disabled={!prefs.voice.enabled}
          value={prefs.voice.autoSpeakReplies}
          onChange={(v) => void update({ voice: { ...prefs.voice, autoSpeakReplies: v } })}
        />
        <Divider />
        <Stepper label="Speaking rate" value={prefs.voice.rate} min={0.5} max={2} step={0.1} format={(v) => `${v.toFixed(1)}×`} onChange={(rate) => void update({ voice: { ...prefs.voice, rate } })} />
        <Stepper label="Pitch" value={prefs.voice.pitch} min={0.5} max={2} step={0.1} format={(v) => v.toFixed(1)} onChange={(pitch) => void update({ voice: { ...prefs.voice, pitch } })} />
        <SelectRow label="Voice" icon="person-circle-outline" value={currentVoice?.name ?? 'System default'} onPress={() => setSheet('voice')} />
        <Button title="Test voice" variant="soft" size="sm" icon="play-outline" onPress={testVoice} style={{ marginTop: 8, alignSelf: 'flex-start' }} />
      </Card>

      <SectionHeader title="Daily briefings" />
      <Card style={{ gap: 8 }}>
        <ToggleRow label="Morning briefing" icon="sunny-outline" value={prefs.briefings.morningEnabled} onChange={(v) => void update({ briefings: { ...prefs.briefings, morningEnabled: v } })} />
        {prefs.briefings.morningEnabled ? (
          <DateTimeField label="Morning time" mode="time" icon="time-outline" clearable={false} value={timeToDate(prefs.briefings.morningTime)} onChange={(d) => d && void update({ briefings: { ...prefs.briefings, morningTime: dateToTime(d) } })} />
        ) : null}
        <ToggleRow label="Evening summary" icon="moon-outline" value={prefs.briefings.eveningEnabled} onChange={(v) => void update({ briefings: { ...prefs.briefings, eveningEnabled: v } })} />
        {prefs.briefings.eveningEnabled ? (
          <DateTimeField label="Evening time" mode="time" icon="time-outline" clearable={false} value={timeToDate(prefs.briefings.eveningTime)} onChange={(d) => d && void update({ briefings: { ...prefs.briefings, eveningTime: dateToTime(d) } })} />
        ) : null}
      </Card>

      <SectionHeader title="Wellness targets" />
      <Card style={{ gap: 0 }}>
        <Stepper label="Water" value={prefs.wellnessTargets.waterMl} min={500} max={6000} step={250} format={(v) => `${(v / 1000).toFixed(2).replace(/0$/, '')} L`} onChange={(waterMl) => void update({ wellnessTargets: { ...prefs.wellnessTargets, waterMl } })} />
        <Stepper label="Sleep" value={prefs.wellnessTargets.sleepHours} min={4} max={12} step={0.5} format={(v) => `${v} h`} onChange={(sleepHours) => void update({ wellnessTargets: { ...prefs.wellnessTargets, sleepHours } })} />
        <Stepper label="Exercise" value={prefs.wellnessTargets.exerciseMinutes} min={0} max={240} step={5} format={(v) => `${v} min`} onChange={(exerciseMinutes) => void update({ wellnessTargets: { ...prefs.wellnessTargets, exerciseMinutes } })} />
        <Stepper label="Steps" value={prefs.wellnessTargets.steps} min={0} max={30000} step={500} format={(v) => v.toLocaleString('en-IN')} onChange={(steps) => void update({ wellnessTargets: { ...prefs.wellnessTargets, steps } })} />
      </Card>

      <SectionHeader title="Home location" />
      <Card>
        <LocationPicker value={prefs.location} onChange={(location) => update({ location })} />
      </Card>

      <SectionHeader title="Region & units" />
      <Card style={{ gap: 14 }}>
        <TextField
          label="Time zone"
          icon="globe-outline"
          value={timezone}
          onChangeText={(t) => {
            setTimezone(t);
            setTzError(null);
          }}
          onEndEditing={() => timezone.trim() !== prefs.timezone && saveTimezone()}
          autoCapitalize="none"
          autoCorrect={false}
          error={tzError}
        />
        <Button
          title="Use phone's time zone"
          variant="ghost"
          size="sm"
          style={{ alignSelf: 'flex-start' }}
          onPress={() => {
            const tz = getCalendars()[0]?.timeZone;
            if (tz && isValidTimeZone(tz)) {
              setTimezone(tz);
              void update({ timezone: tz });
            } else toast.error("Couldn't read the phone's time zone");
          }}
        />
        <TextField
          label="Currency"
          icon="cash-outline"
          value={currency}
          onChangeText={(t) => {
            setCurrency(t.toUpperCase().slice(0, 3));
            setCurrencyError(null);
          }}
          onEndEditing={() => currency !== prefs.currency && saveCurrency()}
          autoCapitalize="characters"
          maxLength={3}
          error={currencyError}
          helper="Used for budgets and spending summaries"
        />
        <Text variant="small" color="textMuted">
          Units
        </Text>
        <Segmented
          options={[
            { value: 'metric', label: 'Metric' },
            { value: 'imperial', label: 'Imperial' },
          ]}
          value={prefs.units}
          onChange={(units) => void update({ units })}
        />
      </Card>
      <View style={{ height: 24 }} />

      <SelectSheet visible={sheet === 'language'} onClose={() => setSheet(null)} title="Reply language" options={LANGUAGE_OPTIONS} value={prefs.language} onSelect={(language) => void update({ language })} />
      <SelectSheet
        visible={sheet === 'voice'}
        onClose={() => setSheet(null)}
        title="Voice"
        options={voiceOptions}
        value={prefs.voice.voiceId ?? '__default'}
        onSelect={(id) => void update({ voice: { ...prefs.voice, voiceId: id === '__default' ? null : id } })}
      />
    </Screen>
  );
}
