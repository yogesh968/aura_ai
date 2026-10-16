import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Card, Icon, Screen, ScreenHeader, SectionHeader, Text, type IconName } from '@/components/ui';
import { useOnline } from '@/lib/network';

interface Tool {
  href: string;
  title: string;
  body: string;
  icon: IconName;
  offline: boolean;
}

const OFFLINE: Tool[] = [
  { href: '/tools/calculator', title: 'Calculator', body: 'Exact maths, percentages, functions', icon: 'calculator-outline', offline: true },
  { href: '/tools/converter', title: 'Unit converter', body: 'Length, weight, temperature, data…', icon: 'swap-horizontal-outline', offline: true },
  { href: '/tools/timer', title: 'Timer & stopwatch', body: 'Countdown with an alarm notification', icon: 'timer-outline', offline: true },
];

const ONLINE: Tool[] = [
  { href: '/tools/research', title: 'Web research', body: 'Answers with sources from the web', icon: 'globe-outline', offline: false },
  { href: '/tools/translate', title: 'Translate', body: 'Hindi, Hinglish, English and more', icon: 'language-outline', offline: false },
  { href: '/tools/write', title: 'Writing assistant', body: 'Emails, messages, rewrites, code help', icon: 'create-outline', offline: false },
  { href: '/tools/weather', title: 'Weather', body: 'Live conditions and 3-day forecast', icon: 'partly-sunny-outline', offline: false },
  { href: '/tools/scan', title: 'Document scanner', body: 'Photograph a page, then summarize it', icon: 'scan-outline', offline: false },
];

function ToolCard({ tool, disabled }: { tool: Tool; disabled: boolean }) {
  const router = useRouter();
  return (
    <Card onPress={() => router.push(tool.href as never)} accessibilityLabel={`${tool.title}. ${tool.body}${disabled ? '. Needs internet' : ''}`} style={{ opacity: disabled ? 0.6 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Icon name={tool.icon} size={24} color="primary" />
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">{tool.title}</Text>
          <Text variant="small" color="textMuted">
            {tool.body}
          </Text>
        </View>
        {disabled ? <Badge label="Needs internet" tone="warning" /> : <Icon name="chevron-forward" size={16} color="textSubtle" />}
      </View>
    </Card>
  );
}

export default function ToolsScreen() {
  const online = useOnline();
  return (
    <Screen header={<ScreenHeader title="Tools" subtitle="Everyday utilities" />}>
      <SectionHeader title="Works offline" />
      <View style={{ gap: 10 }}>
        {OFFLINE.map((t) => (
          <ToolCard key={t.href} tool={t} disabled={false} />
        ))}
      </View>
      <SectionHeader title="Online" />
      <View style={{ gap: 10 }}>
        {ONLINE.map((t) => (
          <ToolCard key={t.href} tool={t} disabled={!online} />
        ))}
      </View>
    </Screen>
  );
}
