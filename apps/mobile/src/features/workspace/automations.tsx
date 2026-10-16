import { View } from 'react-native';
import type { AutomationRun, AutomationTrigger } from '@aura/shared';
import { Badge, Icon, Text, type IconName } from '@/components/ui';
import { formatTime } from '@/lib/format';

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function timeLabel(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return formatTime(d);
}

export function describeTrigger(t: AutomationTrigger): string {
  if (t.type === 'manual') return 'Run manually';
  if (t.type === 'daily') return `Every day at ${timeLabel(t.time)}`;
  const days = [...t.days].sort();
  const label =
    days.length === 7 ? 'Every day' : days.join(',') === '1,2,3,4,5' ? 'Weekdays' : days.join(',') === '0,6' ? 'Weekends' : days.map((d) => DAY_LABELS[d]).join(', ');
  return `${label} at ${timeLabel(t.time)}`;
}

const RUN_TONE: Record<AutomationRun['status'], 'default' | 'primary' | 'success' | 'warning' | 'danger'> = {
  queued: 'default',
  running: 'primary',
  succeeded: 'success',
  partial: 'warning',
  failed: 'danger',
  cancelled: 'default',
};

const RUN_LABEL: Record<AutomationRun['status'], string> = {
  queued: 'Queued',
  running: 'Running',
  succeeded: 'Succeeded',
  partial: 'Partly done',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export function RunStatusBadge({ status }: { status: AutomationRun['status'] }) {
  return <Badge label={RUN_LABEL[status]} tone={RUN_TONE[status]} />;
}

const STEP_ICON: Record<AutomationRun['steps'][number]['status'], { icon: IconName; color: 'success' | 'danger' | 'textSubtle' | 'textMuted' }> = {
  succeeded: { icon: 'checkmark-circle', color: 'success' },
  failed: { icon: 'close-circle', color: 'danger' },
  skipped: { icon: 'remove-circle-outline', color: 'textSubtle' },
  pending: { icon: 'ellipse-outline', color: 'textMuted' },
};

/** Step-by-step outcome of a run. */
export function RunSteps({ run }: { run: AutomationRun }) {
  return (
    <View style={{ gap: 8, marginTop: 10 }}>
      {run.steps.map((s, i) => (
        <View key={`${s.tool}-${i}`} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <Icon name={STEP_ICON[s.status].icon} size={18} color={STEP_ICON[s.status].color} />
          <View style={{ flex: 1 }}>
            <Text variant="caption">
              {i + 1}. {s.label}
            </Text>
            {s.output ? (
              <Text variant="small" color={s.status === 'failed' ? 'danger' : 'textMuted'}>
                {s.output}
              </Text>
            ) : s.status === 'skipped' ? (
              <Text variant="small" color="textSubtle">
                Skipped
              </Text>
            ) : null}
          </View>
        </View>
      ))}
      {run.error && run.steps.every((s) => s.status !== 'failed') ? (
        <Text variant="small" color="danger">
          {run.error}
        </Text>
      ) : null}
    </View>
  );
}
