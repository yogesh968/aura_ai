import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Contact } from 'expo-contacts';
import { useQuery } from '@tanstack/react-query';
import type { PendingAction, RescheduleSuggestion, Source, ToolCallSummary, Weather } from '@aura/shared';
import { Badge, Button, Card, Icon, Text, type IconName } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { endpoints } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/client';
import { queryClient } from '@/lib/data';
import { updateEntity } from '@/lib/db/repo';
import { formatDateTime } from '@/lib/format';
import { toast } from '@/lib/toast';
import { haptics } from '@/lib/haptics';
import { mailtoUrl, smsUrl, whatsappUrls } from '../draftLinks';
import type { PendingTool } from '../chatState';
import { openLink } from './Markdown';

const STATUS_ICON: Record<ToolCallSummary['status'], { icon: IconName; color: 'success' | 'danger' | 'warning' | 'textMuted' }> = {
  succeeded: { icon: 'checkmark-circle', color: 'success' },
  failed: { icon: 'close-circle', color: 'danger' },
  awaiting_confirmation: { icon: 'hand-left', color: 'warning' },
  rejected: { icon: 'remove-circle', color: 'textMuted' },
  cancelled: { icon: 'remove-circle', color: 'textMuted' },
};

/** "Working on it" chip while a tool runs. */
export function PendingToolChip({ tool }: { tool: PendingTool }) {
  const { colors, radius } = useTheme();
  return (
    <View style={[styles.chip, { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill }]} accessibilityLabel={`${tool.label} in progress`}>
      <ActivityIndicator size="small" color={colors.primary} />
      <Text variant="small" color="textMuted">
        {tool.label}…
      </Text>
    </View>
  );
}

/** Result row for a finished tool call; richer cards for known display kinds. */
export function ToolCallView({ call, onUpdate }: { call: ToolCallSummary; onUpdate?: (patch: Partial<ToolCallSummary>) => void }) {
  if (call.status === 'awaiting_confirmation' && call.pendingActionId) {
    return <ConfirmationCard call={call} onUpdate={onUpdate} />;
  }
  const kind = call.display?.kind;
  return (
    <View style={{ gap: 8 }}>
      <ToolResultRow call={call} />
      {call.status === 'succeeded' && kind === 'message_draft' ? <DraftCard draft={call.display as unknown as DraftDisplay} /> : null}
      {call.status === 'succeeded' && kind === 'reschedule' ? (
        <RescheduleCard suggestions={(call.display as { suggestions: RescheduleSuggestion[] }).suggestions} />
      ) : null}
      {call.status === 'succeeded' && kind === 'weather' ? <WeatherCard weather={(call.display as { weather: Weather }).weather} /> : null}
    </View>
  );
}

const ENTITY_ROUTES: Record<string, string> = {
  task: '/task/',
  reminder: '/reminder/',
  event: '/event/',
  note: '/notes/',
  project: '/projects/',
  transaction: '/finance/transaction/',
};

function ToolResultRow({ call }: { call: ToolCallSummary }) {
  const router = useRouter();
  const { colors, radius } = useTheme();
  const s = STATUS_ICON[call.status];
  const kind = typeof call.display?.kind === 'string' ? call.display.kind : null;
  const id = typeof call.display?.id === 'string' ? call.display.id : null;
  const route = call.status === 'succeeded' && kind && id && ENTITY_ROUTES[kind] ? `${ENTITY_ROUTES[kind]}${id}` : null;
  return (
    <Pressable
      disabled={!route}
      accessibilityRole={route ? 'button' : undefined}
      accessibilityLabel={`${call.label}: ${call.summary}${route ? '. Open' : ''}`}
      onPress={() => route && router.push(route as never)}
      style={({ pressed }) => [styles.result, { backgroundColor: pressed ? colors.surfacePressed : colors.surfaceAlt, borderRadius: radius.md }]}
    >
      <Icon name={s.icon} size={18} color={s.color} />
      <View style={{ flex: 1 }}>
        <Text variant="small" color="textMuted">
          {call.label}
        </Text>
        <Text variant="caption">{call.summary}</Text>
      </View>
      {route ? (
        <Text variant="small" color="primary" weight="700">
          Open
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Confirmation gate: shows the real server status; executes only on the user's tap. */
export function ConfirmationCard({ call, onUpdate }: { call: ToolCallSummary; onUpdate?: (patch: Partial<ToolCallSummary>) => void }) {
  const [busy, setBusy] = useState<'confirm' | 'reject' | null>(null);
  const [result, setResult] = useState<PendingAction | null>(null);
  const actions = useQuery({ queryKey: ['actions', 'all'], queryFn: () => endpoints.actions.list('all'), staleTime: 15_000 });
  const known = result ?? actions.data?.find((a) => a.id === call.pendingActionId) ?? null;
  const status = known?.status ?? 'pending';

  const decide = async (kind: 'confirm' | 'reject') => {
    if (!call.pendingActionId) return;
    setBusy(kind);
    try {
      const res = kind === 'confirm' ? await endpoints.actions.confirm(call.pendingActionId) : await endpoints.actions.reject(call.pendingActionId);
      setResult(res);
      if (res.status === 'confirmed') {
        haptics.success();
        onUpdate?.({ status: 'succeeded', summary: res.result ?? call.summary });
      } else if (res.status === 'rejected') {
        onUpdate?.({ status: 'rejected', summary: `Cancelled: ${res.description}` });
      } else if (res.status === 'failed') {
        haptics.error();
        onUpdate?.({ status: 'failed', summary: res.result ?? 'Failed' });
      }
      void queryClient.invalidateQueries({ queryKey: ['actions'] });
    } catch (e) {
      toast.error(errorMessage(e));
      void queryClient.invalidateQueries({ queryKey: ['actions'] });
    } finally {
      setBusy(null);
    }
  };

  const label: Record<PendingAction['status'], { text: string; tone: 'warning' | 'success' | 'danger' | 'default' }> = {
    pending: { text: 'Needs your OK', tone: 'warning' },
    confirmed: { text: 'Done', tone: 'success' },
    rejected: { text: 'Cancelled', tone: 'default' },
    expired: { text: 'Expired', tone: 'default' },
    failed: { text: 'Failed', tone: 'danger' },
  };

  return (
    <Card tone={status === 'pending' ? 'warning' : 'alt'} style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="shield-checkmark-outline" size={20} color={status === 'pending' ? 'warning' : 'textMuted'} />
        <Text variant="subheading" style={{ flex: 1 }}>
          {call.label}
        </Text>
        <Badge label={label[status].text} tone={label[status].tone} />
      </View>
      <Text variant="body">{known?.description ?? call.summary}</Text>
      {known?.result && status !== 'pending' ? (
        <Text variant="caption" color="textMuted">
          {known.result}
        </Text>
      ) : null}
      {status === 'pending' ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="Confirm" size="sm" icon="checkmark" loading={busy === 'confirm'} disabled={busy !== null} onPress={() => void decide('confirm')} style={{ flex: 1 }} />
          <Button title="Cancel" size="sm" variant="secondary" loading={busy === 'reject'} disabled={busy !== null} onPress={() => void decide('reject')} style={{ flex: 1 }} />
        </View>
      ) : null}
    </Card>
  );
}

interface DraftDisplay {
  kind: 'message_draft';
  channel: 'sms' | 'email' | 'whatsapp' | 'other';
  recipient?: string;
  subject?: string;
  body: string;
}

async function open(url: string, fallback?: string) {
  try {
    if (fallback && !(await Linking.canOpenURL(url))) {
      await Linking.openURL(fallback);
      return;
    }
    await Linking.openURL(url);
  } catch {
    if (fallback) await Linking.openURL(fallback).catch(() => toast.error('No app can open this.'));
    else toast.error('No app on this phone can open this.');
  }
}

/** A message draft the user reviews and sends from their own apps. */
export function DraftCard({ draft }: { draft: DraftDisplay }) {
  const pickContact = async () => {
    try {
      const contact = await Contact.presentPicker();
      if (!contact) return;
      const phones = await contact.getPhones();
      const first = phones[0]?.number;
      if (!first) {
        toast.info('That contact has no phone number.');
        return;
      }
      if (phones.length > 1) {
        Alert.alert('Choose a number', undefined, [
          ...phones.slice(0, 4).map((p) => ({ text: `${p.label ?? 'Phone'}: ${p.number}`, onPress: () => void open(smsUrl(draft.body, p.number)) })),
          { text: 'Cancel', style: 'cancel' as const },
        ]);
      } else {
        await open(smsUrl(draft.body, first));
      }
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't open contacts on this build."));
    }
  };
  const wa = whatsappUrls(draft.body);
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="create-outline" size={18} color="primary" />
        <Text variant="subheading" style={{ flex: 1 }}>
          Draft {draft.channel === 'email' ? 'email' : 'message'}
        </Text>
        <Badge label="Not sent" />
      </View>
      {draft.recipient ? (
        <Text variant="caption" color="textMuted">
          To: {draft.recipient}
        </Text>
      ) : null}
      {draft.subject ? <Text variant="bodyStrong">{draft.subject}</Text> : null}
      <Text variant="body" selectable>
        {draft.body}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {draft.channel === 'email' ? (
          <Button title="Open in email" size="sm" icon="mail-outline" onPress={() => void open(mailtoUrl(draft.body, { to: draft.recipient, subject: draft.subject }))} />
        ) : null}
        <Button title="SMS" size="sm" variant={draft.channel === 'sms' ? 'primary' : 'secondary'} icon="chatbubble-outline" onPress={() => void open(smsUrl(draft.body))} />
        <Button title="WhatsApp" size="sm" variant={draft.channel === 'whatsapp' ? 'primary' : 'secondary'} icon="logo-whatsapp" onPress={() => void open(wa.app, wa.web)} />
        {draft.channel !== 'email' ? <Button title="Email" size="sm" variant="secondary" icon="mail-outline" onPress={() => void open(mailtoUrl(draft.body, { subject: draft.subject }))} /> : null}
        <Button title="Pick contact" size="sm" variant="secondary" icon="person-outline" onPress={() => void pickContact()} />
        <Button
          title="Copy"
          size="sm"
          variant="ghost"
          icon="copy-outline"
          onPress={() =>
            void Clipboard.setStringAsync(draft.subject ? `${draft.subject}\n\n${draft.body}` : draft.body).then(() => toast.success('Copied'))
          }
        />
      </View>
      <Text variant="small" color="textSubtle">
        AURA never sends messages for you — you review and send it.
      </Text>
    </Card>
  );
}

/** Reschedule suggestions with per-task Apply (a local, synced edit). */
export function RescheduleCard({ suggestions }: { suggestions: RescheduleSuggestion[] }) {
  const [applied, setApplied] = useState<Record<string, 'ok' | 'error'>>({});
  const apply = async (s: RescheduleSuggestion) => {
    try {
      await updateEntity('task', s.taskId, { dueAt: s.suggestedDueAt });
      setApplied((a) => ({ ...a, [s.taskId]: 'ok' }));
      haptics.success();
    } catch (e) {
      setApplied((a) => ({ ...a, [s.taskId]: 'error' }));
      toast.error(errorMessage(e));
    }
  };
  return (
    <Card style={{ gap: 10 }}>
      <Text variant="subheading">Suggested new times</Text>
      {suggestions.map((s) => (
        <View key={s.taskId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text variant="body" numberOfLines={1}>
              {s.title}
            </Text>
            <Text variant="small" color="textMuted">
              {formatDateTime(s.suggestedDueAt)}
            </Text>
          </View>
          {applied[s.taskId] === 'ok' ? (
            <Badge label="Moved" tone="success" />
          ) : (
            <Button title="Apply" size="sm" variant="soft" onPress={() => void apply(s)} />
          )}
        </View>
      ))}
    </Card>
  );
}

export function WeatherCard({ weather }: { weather: Weather }) {
  const today = weather.daily[0];
  return (
    <Card tone="primary" style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name="partly-sunny-outline" size={28} color="primary" />
        <View style={{ flex: 1 }}>
          <Text variant="heading">{Math.round(weather.current.temperatureC)}°C</Text>
          <Text variant="caption" color="textMuted">
            {weather.current.condition} · {weather.location}
          </Text>
        </View>
      </View>
      {today ? (
        <Text variant="small" color="textMuted">
          Today {Math.round(today.minC)}–{Math.round(today.maxC)}°C{today.precipitationChance != null ? ` · ${today.precipitationChance}% rain` : ''}
        </Text>
      ) : null}
      <Text variant="small" color="textSubtle">
        Source: {weather.source.title}
      </Text>
    </Card>
  );
}

export function SourcesList({ sources }: { sources: Source[] }) {
  const { colors, radius } = useTheme();
  if (!sources.length) return null;
  return (
    <View style={{ gap: 6 }}>
      <Text variant="overline" color="textMuted">
        Sources
      </Text>
      {sources.slice(0, 8).map((s, i) => (
        <Pressable
          key={s.url}
          accessibilityRole="link"
          accessibilityLabel={`Source ${i + 1}: ${s.title}`}
          onPress={() => openLink(s.url)}
          style={({ pressed }) => [styles.source, { borderRadius: radius.sm, backgroundColor: pressed ? colors.surfacePressed : colors.surfaceAlt }]}
        >
          <Text variant="small" color="primary" weight="700">
            {i + 1}
          </Text>
          <View style={{ flex: 1 }}>
            <Text variant="caption" numberOfLines={1}>
              {s.title}
            </Text>
            <Text variant="small" color="textSubtle" numberOfLines={1}>
              {safeHost(s.url)}
            </Text>
          </View>
          <Icon name="open-outline" size={14} color="textSubtle" />
        </Pressable>
      ))}
    </View>
  );
}

function safeHost(url: string) {
  const m = /^https?:\/\/([^/]+)/.exec(url);
  return m ? m[1] : url;
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start' },
  result: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  source: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8 },
});
