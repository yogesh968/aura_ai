import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Reminder } from '@aura/shared';
import { Button, DateTimeField, EmptyState, LoadingState, Screen, ScreenHeader, Text, TextField, ToggleRow } from '@/components/ui';
import { useEntity } from '@/lib/data';
import { createEntity, updateEntity } from '@/lib/db/repo';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { deleteWithUndo } from '@/features/planner/actions';
import { DeleteButton, FormSection, RecurrenceField, handleSaveError, parseDateParam, stringParam } from '@/features/planner/forms';

export default function ReminderEditorScreen() {
  const params = useLocalSearchParams<{ id: string; remindAt?: string; title?: string }>();
  const isNew = params.id === 'new';
  const existing = useEntity('reminder', isNew ? undefined : params.id);

  if (!isNew && existing.isLoading) return <Screen header={<ScreenHeader title="Reminder" />}><LoadingState /></Screen>;
  if (!isNew && !existing.data) {
    return (
      <Screen header={<ScreenHeader title="Reminder" />}>
        <EmptyState icon="help-circle-outline" title="Reminder not found" body="It may have been deleted on another device." />
      </Screen>
    );
  }
  return <ReminderForm key={params.id} reminder={existing.data ?? null} defaultAt={parseDateParam(params.remindAt)} defaultTitle={stringParam(params.title)} />;
}

function nextHour() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

function ReminderForm({ reminder, defaultAt, defaultTitle }: { reminder: Reminder | null; defaultAt: Date | null; defaultTitle?: string }) {
  const router = useRouter();
  const [title, setTitle] = useState(reminder?.title ?? defaultTitle ?? '');
  const [remindAt, setRemindAt] = useState<Date | null>(reminder ? new Date(reminder.remindAt) : (defaultAt ?? nextHour()));
  const [recurrence, setRecurrence] = useState<Reminder['recurrence']>(reminder?.recurrence ?? 'none');
  const [notes, setNotes] = useState(reminder?.notes ?? '');
  const [done, setDone] = useState(reminder?.done ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const nextErrors: Record<string, string> = {};
    if (!title.trim()) nextErrors.title = 'What should I remind you about?';
    if (!remindAt) nextErrors.remindAt = 'Pick a time';
    else if (recurrence === 'none' && !done && remindAt.getTime() < Date.now() - 60_000) nextErrors.remindAt = 'Pick a time in the future';
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setSaving(true);
    const input = { title: title.trim(), remindAt: remindAt!.toISOString(), recurrence, notes: notes.trim() || null, done };
    try {
      if (reminder) await updateEntity('reminder', reminder.id, input);
      else await createEntity('reminder', input);
      haptics.success();
      toast.success(reminder ? 'Reminder updated' : 'Reminder set');
      router.back();
    } catch (e) {
      handleSaveError(e, setErrors);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      header={
        <ScreenHeader
          title={reminder ? 'Edit reminder' : 'New reminder'}
          right={
            reminder ? (
              <DeleteButton
                label="reminder"
                onConfirm={async () => {
                  if (await deleteWithUndo('reminder', reminder, reminder.title)) router.back();
                }}
              />
            ) : null
          }
        />
      }
      footer={
        <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
          <Button title={reminder ? 'Save changes' : 'Set reminder'} fullWidth loading={saving} onPress={() => void save()} />
        </View>
      }
    >
      <TextField label="Remind me to" value={title} onChangeText={setTitle} placeholder="Call mom" autoFocus={!reminder} error={errors.title} maxLength={200} />
      <FormSection title="When">
        <DateTimeField label="Time" value={remindAt} onChange={setRemindAt} clearable={false} icon="alarm-outline" />
        {errors.remindAt ? (
          <Text variant="small" color="danger">
            {errors.remindAt}
          </Text>
        ) : null}
        <RecurrenceField value={recurrence} onChange={setRecurrence} />
        <Text variant="small" color="textSubtle">
          The notification is scheduled on this phone, so it works offline. Allow notifications in Settings → Integrations if you haven’t.
        </Text>
      </FormSection>
      <FormSection title="Details">
        <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />
        {reminder ? <ToggleRow label="Done" description="Done reminders stop notifying" value={done} onChange={setDone} icon="checkmark-done-outline" /> : null}
      </FormSection>
    </Screen>
  );
}
