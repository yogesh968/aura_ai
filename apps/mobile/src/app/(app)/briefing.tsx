import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Briefing } from '@aura/shared';
import {
  Button,
  Card,
  ErrorState,
  GradientCard,
  Icon,
  LoadingState,
  Screen,
  ScreenHeader,
  Segmented,
  StaleBanner,
  Text,
} from '@/components/ui';
import { openLink } from '@/features/assistant/components/Markdown';
import { endpoints } from '@/lib/api/endpoints';
import { useCachedQuery } from '@/lib/data';
import { formatDate, timeAgo } from '@/lib/format';
import { useSettingsStore } from '@/lib/settings';
import { speak, stopSpeaking } from '@/lib/voice/speech';

type Kind = 'morning' | 'evening';

function briefingSpeech(b: Briefing) {
  const parts = [b.greeting + '.'];
  if (b.aiSummary) parts.push(b.aiSummary);
  else {
    for (const s of b.sections) {
      parts.push(s.items.length ? `${s.title}: ${s.items.slice(0, 5).join('; ')}.` : `${s.title}: nothing.`);
    }
  }
  if (b.weather) parts.push(`Weather in ${b.weather.location}: ${b.weather.current.condition}, ${Math.round(b.weather.current.temperatureC)} degrees.`);
  return parts.join(' ');
}

export default function BriefingScreen() {
  const params = useLocalSearchParams<{ kind?: string }>();
  const initial: Kind = params.kind === 'evening' ? 'evening' : params.kind === 'morning' ? 'morning' : new Date().getHours() >= 17 ? 'evening' : 'morning';
  const [kind, setKind] = useState<Kind>(initial);
  const prefs = useSettingsStore((s) => s.preferences);
  const [speaking, setSpeaking] = useState(false);
  const query = useCachedQuery(['briefing', kind], () => endpoints.briefing(kind), { staleTime: 5 * 60_000 });

  useEffect(() => () => void stopSpeaking(), []);

  const toggleSpeak = () => {
    if (!query.data) return;
    if (speaking) {
      void stopSpeaking();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    speak(briefingSpeech(query.data.data), {
      language: prefs.language,
      rate: prefs.voice.rate,
      pitch: prefs.voice.pitch,
      voice: prefs.voice.voiceId,
      onDone: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  const b = query.data?.data;

  return (
    <Screen
      header={<ScreenHeader title={kind === 'morning' ? 'Morning briefing' : 'Evening summary'} />}
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      <Segmented
        value={kind}
        onChange={(k) => {
          void stopSpeaking();
          setSpeaking(false);
          setKind(k);
        }}
        options={[
          { value: 'morning', label: 'Morning' },
          { value: 'evening', label: 'Evening' },
        ]}
      />
      <View style={{ marginTop: 16 }}>
        {query.isLoading ? (
          <LoadingState label="Preparing your briefing…" />
        ) : query.error && !b ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : b ? (
          <View style={{ gap: 14 }}>
            <StaleBanner cachedAt={query.data?.cachedAt} />
            <Animated.View entering={FadeInDown.duration(250)}>
              <GradientCard>
                <Text variant="overline" style={{ color: 'rgba(255,255,255,0.85)' }}>
                  {formatDate(b.date, { weekday: 'long', day: 'numeric', month: 'long' })}
                </Text>
                <Text variant="title" style={{ color: '#FFFFFF', marginTop: 4 }}>
                  {b.greeting}
                </Text>
                {b.aiSummary ? (
                  <Text variant="body" style={{ color: '#FFFFFF', marginTop: 10 }}>
                    {b.aiSummary}
                  </Text>
                ) : (
                  <Text variant="caption" style={{ color: 'rgba(255,255,255,0.85)', marginTop: 10 }}>
                    {b.aiAvailable ? 'The AI summary could not be generated this time — here are your facts.' : 'AI summary unavailable (no AI provider on the server) — here are your facts.'}
                  </Text>
                )}
                <Button
                  title={speaking ? 'Stop reading' : 'Read aloud'}
                  icon={speaking ? 'stop-circle-outline' : 'volume-high-outline'}
                  size="sm"
                  variant="secondary"
                  style={{ alignSelf: 'flex-start', marginTop: 14 }}
                  onPress={toggleSpeak}
                />
              </GradientCard>
            </Animated.View>

            {b.weather ? (
              <Card style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Icon name="partly-sunny-outline" size={26} color="accent" />
                  <View style={{ flex: 1 }}>
                    <Text variant="subheading">{`${Math.round(b.weather.current.temperatureC)}°C · ${b.weather.current.condition}`}</Text>
                    <Text variant="small" color="textMuted">
                      {b.weather.location}
                    </Text>
                  </View>
                </View>
                {b.weather.daily[0] ? (
                  <Text variant="caption" color="textMuted">
                    {`Today ${Math.round(b.weather.daily[0].minC)}–${Math.round(b.weather.daily[0].maxC)}°C${b.weather.daily[0].precipitationChance != null ? ` · ${b.weather.daily[0].precipitationChance}% chance of rain` : ''}`}
                  </Text>
                ) : null}
                <Pressable accessibilityRole="link" onPress={() => openLink(b.weather!.source.url)}>
                  <Text variant="small" color="primary">{`Source: ${b.weather.source.title} · ${timeAgo(b.weather.fetchedAt)}`}</Text>
                </Pressable>
              </Card>
            ) : (
              <Text variant="small" color="textSubtle">
                Weather not shown — set your city in Settings → Assistant to include it.
              </Text>
            )}

            {b.sections.map((s) => (
              <Card key={s.title} style={{ gap: 6 }}>
                <Text variant="subheading">{s.title}</Text>
                {s.items.length === 0 ? (
                  <Text variant="caption" color="textMuted">
                    Nothing here.
                  </Text>
                ) : (
                  s.items.map((item, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                      <Text variant="body" color="primary">
                        •
                      </Text>
                      <Text variant="body" style={{ flex: 1 }}>
                        {item}
                      </Text>
                    </View>
                  ))
                )}
              </Card>
            ))}
            <Text variant="small" color="textSubtle" align="center">
              {`Generated ${timeAgo(b.generatedAt)} from your AURA data`}
            </Text>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
