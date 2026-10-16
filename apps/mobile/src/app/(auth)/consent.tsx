import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Button, Card, Checkbox, Icon, Screen, ScreenHeader, Sheet, Text, type IconName } from '@/components/ui';
import { useSettingsStore } from '@/lib/settings';

const POINTS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'server-outline',
    title: 'What is stored',
    body: 'Your account and the things you create (tasks, notes, habits, money entries…) are kept on this phone and synced to your AURA server.',
  },
  {
    icon: 'sparkles-outline',
    title: 'What the AI sees',
    body: 'Only when you use AI features: your chat messages, documents you attach, and the memories relevant to answering. They are sent to the AI provider your server is configured with.',
  },
  {
    icon: 'bulb-outline',
    title: 'Memory is yours',
    body: 'AURA only remembers what you approve. Review, edit or delete memories anytime — or turn memory off.',
  },
  {
    icon: 'hand-left-outline',
    title: 'You stay in control',
    body: 'Deleting things, saving memories and other sensitive actions always ask for your confirmation. AURA never sends messages or moves money for you.',
  },
  {
    icon: 'key-outline',
    title: 'Permissions only when needed',
    body: 'Microphone, notifications, calendar, contacts and location are requested only when you use a feature that needs them, with an explanation.',
  },
  {
    icon: 'download-outline',
    title: 'Export & delete',
    body: 'Download all your data or permanently delete your account from Settings → Privacy. Your data is never sold.',
  },
];

export default function ConsentScreen() {
  const router = useRouter();
  const accept = useSettingsStore((s) => s.setConsentAccepted);
  const [agreed, setAgreed] = useState(false);
  const [details, setDetails] = useState(false);

  return (
    <Screen
      header={<ScreenHeader title="Your privacy" large subtitle="A quick, honest summary before you start" />}
      footer={
        <View style={{ paddingHorizontal: 20, paddingTop: 12, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
            <Checkbox checked={agreed} onToggle={() => setAgreed((a) => !a)} label="I understand and agree" />
            <Pressable importantForAccessibility="no" onPress={() => setAgreed((a) => !a)} style={{ flex: 1, minHeight: 48, justifyContent: 'center' }}>
              <Text variant="body">I understand and agree</Text>
            </Pressable>
          </View>
          <Button
            title="Continue"
            size="lg"
            fullWidth
            disabled={!agreed}
            onPress={() => {
              accept();
              router.replace('/sign-in');
            }}
          />
        </View>
      }
    >
      <View style={{ gap: 12 }}>
        {POINTS.map((p, i) => (
          <Animated.View key={p.title} entering={FadeInDown.duration(250).delay(i * 40)}>
            <Card style={{ flexDirection: 'row', gap: 12 }}>
              <Icon name={p.icon} size={22} color="primary" />
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="subheading">{p.title}</Text>
                <Text variant="caption" color="textMuted">
                  {p.body}
                </Text>
              </View>
            </Card>
          </Animated.View>
        ))}
        <Pressable accessibilityRole="link" onPress={() => setDetails(true)} style={{ minHeight: 48, justifyContent: 'center' }}>
          <Text variant="caption" color="primary" weight="600">
            Read the full privacy summary
          </Text>
        </Pressable>
      </View>

      <Sheet visible={details} onClose={() => setDetails(false)} title="Privacy summary">
        <View style={{ gap: 12, paddingBottom: 12 }}>
          <Text variant="body">
            AURA is a personal assistant that runs against your own AURA server. Access to your data requires your account credentials; passwords are stored only as secure hashes and sign-in tokens are kept in the phone’s secure storage.
          </Text>
          <Text variant="body">
            Offline data lives in an on-device database and is removed when you sign out. Synced data stays on your server until you delete it or your account.
          </Text>
          <Text variant="body">
            AI requests go through your server, which holds the AI provider key. Content from web pages and documents is treated as untrusted and cannot trigger actions on its own.
          </Text>
          <Text variant="body">
            Wellness and finance features give general information, not medical, legal or financial advice.
          </Text>
        </View>
      </Sheet>
    </Screen>
  );
}
