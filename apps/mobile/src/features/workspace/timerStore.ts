import { create } from 'zustand';
import * as Notifications from 'expo-notifications';
import { CHANNELS, notificationPermission, requestNotificationPermission } from '@/lib/notifications/scheduler';
import { formatDuration, timerElapsed, timerRemaining, type TimerState } from './helpers';

/**
 * Timer and stopwatch state lives in a module store so it survives leaving
 * the screen. Times are computed from timestamps, never by counting ticks,
 * so they stay correct when the app is backgrounded.
 */
interface State {
  timer: TimerState & { notificationId: string | null; finished: boolean };
  stopwatch: TimerState & { laps: number[] };
  setDuration: (ms: number) => void;
  startTimer: () => Promise<{ notified: boolean }>;
  pauseTimer: () => Promise<void>;
  resetTimer: () => Promise<void>;
  markFinished: () => void;
  startStopwatch: () => void;
  pauseStopwatch: () => void;
  lap: () => void;
  resetStopwatch: () => void;
}

async function cancel(id: string | null) {
  if (id) await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
}

export const useTimerStore = create<State>((set, get) => ({
  timer: { durationMs: 5 * 60_000, startedAt: null, elapsedBefore: 0, notificationId: null, finished: false },
  stopwatch: { durationMs: 0, startedAt: null, elapsedBefore: 0, laps: [] },

  setDuration: (ms) => set({ timer: { durationMs: ms, startedAt: null, elapsedBefore: 0, notificationId: null, finished: false } }),

  startTimer: async () => {
    const t = get().timer;
    const now = Date.now();
    const remaining = timerRemaining(t, now);
    if (remaining <= 0 || t.startedAt != null) return { notified: t.notificationId != null };
    let notificationId: string | null = null;
    let { status } = await notificationPermission().catch(() => ({ status: 'denied' as const }));
    if (status === 'undetermined') status = await requestNotificationPermission().catch(() => 'denied' as const);
    if (status === 'granted') {
      notificationId = await Notifications.scheduleNotificationAsync({
        content: { title: "Time's up", body: `Your ${formatDuration(t.durationMs)} timer finished.`, data: { source: 'aura-timer', url: '/tools/timer' }, sound: 'default' },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(now + remaining), channelId: CHANNELS.reminders },
      }).catch(() => null);
    }
    set({ timer: { ...t, startedAt: now, notificationId, finished: false } });
    return { notified: notificationId != null };
  },

  pauseTimer: async () => {
    const t = get().timer;
    if (t.startedAt == null) return;
    await cancel(t.notificationId);
    set({ timer: { ...t, elapsedBefore: timerElapsed(t, Date.now()), startedAt: null, notificationId: null } });
  },

  resetTimer: async () => {
    const t = get().timer;
    await cancel(t.notificationId);
    set({ timer: { durationMs: t.durationMs, startedAt: null, elapsedBefore: 0, notificationId: null, finished: false } });
  },

  markFinished: () => {
    const t = get().timer;
    set({ timer: { ...t, elapsedBefore: t.durationMs, startedAt: null, notificationId: null, finished: true } });
  },

  startStopwatch: () => {
    const s = get().stopwatch;
    if (s.startedAt == null) set({ stopwatch: { ...s, startedAt: Date.now() } });
  },
  pauseStopwatch: () => {
    const s = get().stopwatch;
    if (s.startedAt != null) set({ stopwatch: { ...s, elapsedBefore: timerElapsed(s, Date.now()), startedAt: null } });
  },
  lap: () => {
    const s = get().stopwatch;
    set({ stopwatch: { ...s, laps: [timerElapsed(s, Date.now()), ...s.laps].slice(0, 50) } });
  },
  resetStopwatch: () => set({ stopwatch: { durationMs: 0, startedAt: null, elapsedBefore: 0, laps: [] } }),
}));
