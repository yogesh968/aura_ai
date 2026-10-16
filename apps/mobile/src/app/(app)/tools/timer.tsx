import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Chip, Divider, ProgressRing, Screen, ScreenHeader, Segmented, Text, TextField } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { formatDuration, timerElapsed, timerRemaining } from '@/features/workspace/helpers';
import { useTimerStore } from '@/features/workspace/timerStore';

const PRESETS = [1, 5, 10, 15, 25, 45, 60];

/** Re-render periodically while something is running. */
function useNow(active: boolean, intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return now;
}

function TimerPanel() {
  const { timer, setDuration, startTimer, pauseTimer, resetTimer, markFinished } = useTimerStore();
  const running = timer.startedAt != null;
  const now = useNow(running, 250);
  const remaining = timerRemaining(timer, now);
  const [custom, setCustom] = useState('');

  useEffect(() => {
    if (running && remaining <= 0) {
      markFinished();
      haptics.success();
    }
  }, [running, remaining, markFinished]);

  const fresh = !running && timer.elapsedBefore === 0;
  const progress = timer.durationMs ? remaining / timer.durationMs : 0;

  return (
    <View style={{ alignItems: 'center', gap: 16 }}>
      <ProgressRing value={progress} size={220} stroke={12} label="Time remaining">
        <Text variant="display" accessibilityLiveRegion="polite">
          {formatDuration(remaining)}
        </Text>
        <Text variant="small" color="textMuted">
          {timer.finished ? "Time's up!" : running ? 'Running' : fresh ? 'Ready' : 'Paused'}
        </Text>
      </ProgressRing>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {running ? (
          <Button title="Pause" icon="pause" variant="secondary" onPress={() => void pauseTimer()} />
        ) : (
          <Button
            title={fresh ? 'Start' : 'Resume'}
            icon="play"
            disabled={remaining <= 0}
            onPress={() =>
              void startTimer().then(({ notified }) => {
                if (!notified) toast.info("Notifications are off, so you'll only see the alarm while this screen is open.");
              })
            }
          />
        )}
        <Button title="Reset" icon="refresh" variant="ghost" disabled={fresh && !timer.finished} onPress={() => void resetTimer()} />
      </View>
      {!running ? (
        <Card style={{ alignSelf: 'stretch', gap: 12 }}>
          <Text variant="small" color="textMuted">
            Set duration
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {PRESETS.map((m) => (
              <Chip key={m} label={`${m} min`} selected={timer.durationMs === m * 60_000} onPress={() => setDuration(m * 60_000)} />
            ))}
          </View>
          <TextField
            placeholder="Custom minutes"
            keyboardType="number-pad"
            value={custom}
            onChangeText={setCustom}
            onSubmitEditing={() => {
              const m = Number(custom);
              if (Number.isFinite(m) && m > 0 && m <= 24 * 60) {
                setDuration(Math.round(m * 60_000));
                setCustom('');
              } else toast.error('Enter minutes between 1 and 1440');
            }}
            returnKeyType="done"
            helper="Press done to apply"
          />
        </Card>
      ) : null}
    </View>
  );
}

function StopwatchPanel() {
  const { stopwatch, startStopwatch, pauseStopwatch, lap, resetStopwatch } = useTimerStore();
  const running = stopwatch.startedAt != null;
  const now = useNow(running, 100);
  const elapsed = timerElapsed(stopwatch, now);
  return (
    <View style={{ gap: 16 }}>
      <Text variant="display" align="center" style={{ fontSize: 48, lineHeight: 56, marginVertical: 24 }} accessibilityLabel={`Elapsed ${formatDuration(elapsed)}`}>
        {formatDuration(elapsed, true)}
      </Text>
      <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center' }}>
        {running ? <Button title="Pause" icon="pause" variant="secondary" onPress={pauseStopwatch} /> : <Button title={elapsed ? 'Resume' : 'Start'} icon="play" onPress={startStopwatch} />}
        <Button title="Lap" icon="flag-outline" variant="soft" disabled={!running} onPress={lap} />
        <Button title="Reset" icon="refresh" variant="ghost" disabled={running || elapsed === 0} onPress={resetStopwatch} />
      </View>
      {stopwatch.laps.length ? (
        <Card padded={false}>
          {stopwatch.laps.map((t, i) => {
            const prev = stopwatch.laps[i + 1] ?? 0;
            return (
              <View key={`${t}-${i}`}>
                <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12 }}>
                  <Text variant="body" style={{ flex: 1 }}>
                    Lap {stopwatch.laps.length - i}
                  </Text>
                  <Text variant="caption" color="textMuted" style={{ marginRight: 16 }}>
                    +{formatDuration(t - prev, true)}
                  </Text>
                  <Text variant="bodyStrong">{formatDuration(t, true)}</Text>
                </View>
                {i < stopwatch.laps.length - 1 ? <Divider inset={16} /> : null}
              </View>
            );
          })}
        </Card>
      ) : null}
    </View>
  );
}

export default function TimerScreen() {
  const [mode, setMode] = useState<'timer' | 'stopwatch'>('timer');
  return (
    <Screen header={<ScreenHeader title="Timer & stopwatch" subtitle="Works offline" />}>
      <Segmented
        options={[
          { value: 'timer', label: 'Timer' },
          { value: 'stopwatch', label: 'Stopwatch' },
        ]}
        value={mode}
        onChange={setMode}
      />
      <View style={{ marginTop: 24 }}>{mode === 'timer' ? <TimerPanel /> : <StopwatchPanel />}</View>
    </Screen>
  );
}
