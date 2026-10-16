import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Fab, Screen, Segmented, Text } from '@/components/ui';
import { syncNow, useSyncStore } from '@/lib/sync/engine';
import { WellnessSection } from '@/features/life/sections/WellnessSection';
import { HabitsSection } from '@/features/life/sections/HabitsSection';
import { MoneySection } from '@/features/life/sections/MoneySection';
import { GoalsSection } from '@/features/life/sections/GoalsSection';

type Tab = 'wellness' | 'habits' | 'money' | 'goals';

const SUBTITLES: Record<Tab, string> = {
  wellness: 'Water, sleep, movement and mood',
  habits: 'Small wins, every day',
  money: 'Manual tracking — never connected to your bank',
  goals: 'Where you are headed',
};

export default function LifeScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('wellness');
  const syncing = useSyncStore((s) => s.status === 'syncing');

  return (
    <View style={{ flex: 1 }}>
      <Screen tabBarInset refreshing={syncing} onRefresh={() => void syncNow()}>
        <Text variant="title" accessibilityRole="header" style={{ marginTop: 8 }}>
          Life
        </Text>
        <Text variant="caption" color="textMuted" style={{ marginBottom: 14 }}>
          {SUBTITLES[tab]}
        </Text>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'wellness', label: 'Wellness' },
            { value: 'habits', label: 'Habits' },
            { value: 'money', label: 'Money' },
            { value: 'goals', label: 'Goals' },
          ]}
        />
        <View style={{ marginTop: 16 }}>
          {tab === 'wellness' ? <WellnessSection /> : null}
          {tab === 'habits' ? <HabitsSection /> : null}
          {tab === 'money' ? <MoneySection /> : null}
          {tab === 'goals' ? <GoalsSection /> : null}
        </View>
      </Screen>
      {tab === 'habits' ? <Fab label="New habit" onPress={() => router.push('/habits/new')} /> : null}
      {tab === 'money' ? <Fab label="Add transaction" onPress={() => router.push('/finance/transaction/new')} /> : null}
    </View>
  );
}
