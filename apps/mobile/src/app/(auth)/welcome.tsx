import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View, type ViewToken } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, Icon, Text, type IconName } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { endpoints } from '@/lib/api/endpoints';
import { getApiBaseUrl } from '@/lib/api/config';
import { useSettingsStore } from '@/lib/settings';
import { ServerUrlSheet } from '@/features/account/ServerUrlSheet';

const SLIDES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'sunny-outline',
    title: 'Your day, organized',
    body: 'Tasks, reminders, calendar, habits and money in one calm place — with a morning briefing to start strong.',
  },
  {
    icon: 'chatbubbles-outline',
    title: 'Talk naturally — English, हिन्दी, Hinglish',
    body: '“Kal subah 9 baje doctor yaad dilana.” Type or speak, and AURA turns it into action.',
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Private by design',
    body: 'You approve what AURA remembers and every sensitive action. Export or delete your data anytime.',
  },
];

type ServerState = 'checking' | 'ok' | 'unreachable';

export default function WelcomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const consented = useSettingsStore((s) => s.consentAcceptedAt !== null);
  const [index, setIndex] = useState(0);
  const [server, setServer] = useState<ServerState>('checking');
  const [sheet, setSheet] = useState(false);
  const listRef = useRef<FlatList>(null);

  const probe = useCallback(
    () =>
      endpoints
        .health()
        .then(() => 'ok' as const)
        .catch(() => 'unreachable' as const),
    [],
  );

  useEffect(() => {
    let active = true;
    void probe().then((r) => active && setServer(r));
    return () => {
      active = false;
    };
  }, [probe]);

  const check = useCallback(async () => {
    setServer('checking');
    setServer(await probe());
  }, [probe]);

  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setIndex(first.index);
  }, []);

  const last = index === SLIDES.length - 1;
  const next = () => {
    if (!last) listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    else router.push(consented ? '/sign-in' : '/consent');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}>
      <Animated.View entering={FadeIn.duration(400)} style={styles.brand}>
        <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.logo}>
          <Icon name="sparkles" size={22} color="#FFFFFF" />
        </LinearGradient>
        <Text variant="heading">AURA</Text>
      </Animated.View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.title}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item, index: i }) => (
          <View style={{ width, paddingHorizontal: 28, justifyContent: 'center' }}>
            <Animated.View entering={FadeInDown.duration(350).delay(i === 0 ? 150 : 0)} style={{ gap: 18 }}>
              <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
                <Icon name={item.icon} size={56} color="#FFFFFF" />
              </LinearGradient>
              <Text variant="display" accessibilityRole="header">
                {item.title}
              </Text>
              <Text variant="body" color="textMuted">
                {item.body}
              </Text>
            </Animated.View>
          </View>
        )}
      />

      <View style={styles.dots} accessibilityLabel={`Slide ${index + 1} of ${SLIDES.length}`}>
        {SLIDES.map((s, i) => (
          <View key={s.title} style={[styles.dot, { backgroundColor: i === index ? colors.primary : colors.border, width: i === index ? 22 : 8 }]} />
        ))}
      </View>

      <View style={{ paddingHorizontal: 24, gap: 12 }}>
        {server === 'unreachable' ? (
          <Card tone="warning" style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Icon name="cloud-offline-outline" size={18} color="warning" />
              <Text variant="subheading" style={{ flex: 1 }}>
                {"Can't reach the AURA server"}
              </Text>
            </View>
            <Text variant="caption" color="textMuted">
              {`Trying ${getApiBaseUrl()}. Start the backend, or set the right address (on a physical phone use your computer's LAN IP).`}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Server settings" size="sm" variant="secondary" icon="settings-outline" onPress={() => setSheet(true)} />
              <Button title="Retry" size="sm" variant="ghost" onPress={check} />
            </View>
          </Card>
        ) : null}
        <Button title={last ? 'Get started' : 'Next'} size="lg" fullWidth iconRight="arrow-forward" onPress={next} />
        {!last ? <Button title="Skip" variant="ghost" fullWidth onPress={() => router.push(consented ? '/sign-in' : '/consent')} /> : null}
      </View>

      <ServerUrlSheet visible={sheet} onClose={() => setSheet(false)} onSaved={check} />
    </View>
  );
}

const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 24, paddingTop: 12 },
  logo: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  hero: { width: 112, height: 112, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginVertical: 20 },
  dot: { height: 8, borderRadius: 4 },
});
