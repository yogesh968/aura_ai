import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { CalendarEvent } from '@aura/shared';
import { Button, ChipGroup, DateTimeField, EmptyState, LoadingState, Screen, ScreenHeader, Text, TextField, ToggleRow } from '@/components/ui';
import { useEntity } from '@/lib/data';
import { createEntity, updateEntity } from '@/lib/db/repo';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { deleteWithUndo } from '@/features/planner/actions';
import { addEventToPhoneCalendar } from '@/features/planner/deviceCalendar';
import { DeleteButton, FormSection, RecurrenceField, SelectField, handleSaveError, parseDateParam, stringParam } from '@/features/planner/forms';

const KIND_OPTIONS = [
  { value: 'event' as const, label: 'Event', icon: 'calendar-outline' as const },
  { value: 'appointment' as const, label: 'Appointment', icon: 'medkit-outline' as const },
  { value: 'birthday' as const, label: 'Birthday', icon: 'gift-outline' as const },
];

const ALERT_OPTIONS = [
  { value: 'none', label: 'No alert' },
  { value: '0', label: 'At start time' },
  { value: '5', label: '5 minutes before' },
  { value: '10', label: '10 minutes before' },
  { value: '15', label: '15 minutes before' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '1440', label: '1 day before' },
];

export default function EventEditorScreen() {
  const params = useLocalSearchParams<{ id: string; startAt?: string; title?: string }>();
  const isNew = params.id === 'new';
  const existing = useEntity('event', isNew ? undefined : params.id);

  if (!isNew && existing.isLoading) return <Screen header={<ScreenHeader title="Event" />}><LoadingState /></Screen>;
  if (!isNew && !existing.data) {
    return (
      <Screen header={<ScreenHeader title="Event" />}>
        <EmptyState icon="help-circle-outline" title="Event not found" body="It may have been deleted on another device." />
      </Screen>
    );
  }
  return <EventForm key={params.id} event={existing.data ?? null} defaultStart={parseDateParam(params.startAt)} defaultTitle={stringParam(params.title)} />;
}

function roundedNextHour() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

function EventForm({ event, defaultStart, defaultTitle }: { event: CalendarEvent | null; defaultStart: Date | null; defaultTitle?: string }) {
  const router = useRouter();
  const initialStart = event ? new Date(event.startAt) : (defaultStart ?? roundedNextHour());
  const [title, setTitle] = useState(event?.title ?? defaultTitle ?? '');
  const [kind, setKind] = useState<CalendarEvent['kind']>(event?.kind ?? 'event');
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [startAt, setStartAt] = useState<Date | null>(initialStart);
  const [endAt, setEndAt] = useState<Date | null>(event ? (event.endAt ? new Date(event.endAt) : null) : new Date(initialStart.getTime() + 3_600_000));
  const [location, setLocation] = useState(event?.location ?? '');
  const [notes, setNotes] = useState(event?.notes ?? '');
  const [recurrence, setRecurrence] = useState<CalendarEvent['recurrence']>(event?.recurrence ?? 'none');
  const [alert, setAlert] = useState(event ? (event.reminderMinutesBefore == null ? 'none' : String(event.reminderMinutesBefore)) : '15');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const changeKind = (k: CalendarEvent['kind']) => {
    setKind(k);
    if (k === 'birthday') {
      setAllDay(true);
      setRecurrence('yearly');
      setAlert('0');
    }
  };

  const buildInput = () => {
    const start = startAt ? new Date(startAt) : null;
    let end = endAt ? new Date(endAt) : null;
    if (start && allDay) {
      start.setHours(0, 0, 0, 0);
      if (end) end.setHours(23, 59, 0, 0);
    }
    if (start && end && end < start) end = null;
    return {
      title: title.trim(),
      kind,
      allDay,
      startAt: start?.toISOString() ?? '',
      endAt: end?.toISOString() ?? null,
      location: location.trim() || null,
      notes: notes.trim() || null,
      recurrence,
      reminderMinutesBefore: alert === 'none' ? null : Number(alert),
    };
  };

  const save = async () => {
    const nextErrors: Record<string, string> = {};
    if (!title.trim()) nextErrors.title = 'Give the event a title';
    if (!startAt) nextErrors.startAt = 'Pick a start';
    if (startAt && endAt && endAt < startAt && !allDay) nextErrors.endAt = 'End must be after the start';
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setSaving(true);
    try {
      const input = buildInput();
      if (event) await updateEntity('event', event.id, input);
      else await createEntity('event', input);
      haptics.success();
      toast.success(event ? 'Event updated' : 'Event added');
      router.back();
    } catch (e) {
      handleSaveError(e, setErrors);
    } finally {
      setSaving(false);
    }
  };

  const exportToPhone = async () => {
    if (!event) return;
    setExporting(true);
    try {
      const calendarName = await addEventToPhoneCalendar(event);
      toast.success(`Added to “${calendarName}” on your phone`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add to the phone calendar");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Screen
      header={
        <ScreenHeader
          title={event ? 'Edit event' : 'New event'}
          right={
            event ? (
              <DeleteButton
                label="event"
                onConfirm={async () => {
                  if (await deleteWithUndo('event', event, event.title)) router.back();
                }}
              />
            ) : null
          }
        />
      }
      footer={
        <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
          <Button title={event ? 'Save changes' : 'Add event'} fullWidth loading={saving} onPress={() => void save()} />
        </View>
      }
    >
      <TextField label="Title" value={title} onChangeText={setTitle} placeholder="Lunch with Rohan" autoFocus={!event} error={errors.title} maxLength={200} />

      <FormSection title="Type">
        <ChipGroup options={KIND_OPTIONS} value={kind} onChange={changeKind} />
      </FormSection>

      <FormSection title="When">
        <ToggleRow label="All day" value={allDay} onChange={setAllDay} icon="sunny-outline" />
        <DateTimeField label="Starts" value={startAt} onChange={setStartAt} mode={allDay ? 'date' : 'datetime'} clearable={false} />
        {errors.startAt ? (
          <Text variant="small" color="danger">
            {errors.startAt}
          </Text>
        ) : null}
        {kind !== 'birthday' ? <DateTimeField label="Ends" value={endAt} onChange={setEndAt} mode={allDay ? 'date' : 'datetime'} /> : null}
        {errors.endAt ? (
          <Text variant="small" color="danger">
            {errors.endAt}
          </Text>
        ) : null}
        <RecurrenceField value={recurrence} onChange={setRecurrence} />
        <SelectField label="Alert" value={alert} options={ALERT_OPTIONS} onChange={setAlert} icon="notifications-outline" />
      </FormSection>

      <FormSection title="Details">
        <TextField label="Location" value={location} onChangeText={setLocation} placeholder="Optional" icon="location-outline" />
        <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />
      </FormSection>

      {event ? (
        <FormSection title="Phone calendar">
          <Text variant="caption" color="textMuted">
            Copy this event into your phone’s calendar app. Later edits in AURA are not copied automatically.
          </Text>
          <Button title="Add to phone calendar" icon="phone-portrait-outline" variant="secondary" loading={exporting} onPress={() => void exportToPhone()} />
        </FormSection>
      ) : null}
    </Screen>
  );
}
