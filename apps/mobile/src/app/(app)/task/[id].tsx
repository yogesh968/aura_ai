import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Task } from '@aura/shared';
import { Button, ChipGroup, DateTimeField, EmptyState, LoadingState, Screen, ScreenHeader, Text, TextField } from '@/components/ui';
import { useEntities, useEntity } from '@/lib/data';
import { createEntity, updateEntity } from '@/lib/db/repo';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { deleteWithUndo } from '@/features/planner/actions';
import {
  DeleteButton,
  FormSection,
  PRIORITY_OPTIONS,
  RecurrenceField,
  SelectField,
  handleSaveError,
  parseDateParam,
  stringParam,
} from '@/features/planner/forms';

const STATUS_OPTIONS = [
  { value: 'todo' as const, label: 'To do' },
  { value: 'in_progress' as const, label: 'In progress' },
  { value: 'done' as const, label: 'Done' },
  { value: 'cancelled' as const, label: 'Cancelled' },
];

export default function TaskEditorScreen() {
  const params = useLocalSearchParams<{ id: string; dueAt?: string; title?: string; projectId?: string }>();
  const isNew = params.id === 'new';
  const existing = useEntity('task', isNew ? undefined : params.id);

  if (!isNew && existing.isLoading) return <Screen header={<ScreenHeader title="Task" />}><LoadingState /></Screen>;
  if (!isNew && !existing.data) {
    return (
      <Screen header={<ScreenHeader title="Task" />}>
        <EmptyState icon="help-circle-outline" title="Task not found" body="It may have been deleted on another device." />
      </Screen>
    );
  }
  return (
    <TaskForm
      key={params.id}
      task={existing.data ?? null}
      defaults={{ dueAt: parseDateParam(params.dueAt), title: stringParam(params.title), projectId: stringParam(params.projectId) }}
    />
  );
}

function TaskForm({ task, defaults }: { task: Task | null; defaults: { dueAt: Date | null; title?: string; projectId?: string } }) {
  const router = useRouter();
  const projects = useEntities('project');
  const [title, setTitle] = useState(task?.title ?? defaults.title ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [priority, setPriority] = useState<Task['priority']>(task?.priority ?? 'medium');
  const [status, setStatus] = useState<Task['status']>(task?.status ?? 'todo');
  const [dueAt, setDueAt] = useState<Date | null>(task?.dueAt ? new Date(task.dueAt) : defaults.dueAt);
  const [remindAt, setRemindAt] = useState<Date | null>(task?.remindAt ? new Date(task.remindAt) : null);
  const [recurrence, setRecurrence] = useState<Task['recurrence']>(task?.recurrence ?? 'none');
  const [projectId, setProjectId] = useState<string>(task?.projectId ?? defaults.projectId ?? '');
  const [tags, setTags] = useState((task?.tags ?? []).join(', '));
  const [estimate, setEstimate] = useState(task?.estimateMinutes ? String(task.estimateMinutes) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const projectOptions = useMemo(
    () => [{ value: '', label: 'No project' }, ...(projects.data ?? []).filter((p) => p.status === 'active' || p.id === projectId).map((p) => ({ value: p.id, label: p.name }))],
    [projects.data, projectId],
  );

  const save = async () => {
    const nextErrors: Record<string, string> = {};
    if (!title.trim()) nextErrors.title = 'Give the task a title';
    const est = estimate.trim() ? Number(estimate) : null;
    if (est !== null && (!Number.isInteger(est) || est <= 0 || est > 1440)) nextErrors.estimateMinutes = 'Enter minutes between 1 and 1440';
    if (recurrence !== 'none' && !dueAt) nextErrors.recurrence = 'Repeating tasks need a due date';
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setSaving(true);
    const input = {
      title: title.trim(),
      notes: notes.trim() || null,
      priority,
      status,
      completedAt: status === 'done' ? (task?.completedAt ?? new Date().toISOString()) : null,
      dueAt: dueAt?.toISOString() ?? null,
      remindAt: remindAt?.toISOString() ?? null,
      recurrence,
      projectId: projectId || null,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 20),
      estimateMinutes: est,
    };
    try {
      if (task) await updateEntity('task', task.id, input);
      else await createEntity('task', input);
      haptics.success();
      toast.success(task ? 'Task updated' : 'Task added');
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
          title={task ? 'Edit task' : 'New task'}
          right={
            task ? (
              <DeleteButton
                label="task"
                onConfirm={async () => {
                  if (await deleteWithUndo('task', task, task.title)) router.back();
                }}
              />
            ) : null
          }
        />
      }
      footer={
        <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
          <Button title={task ? 'Save changes' : 'Add task'} fullWidth loading={saving} onPress={() => void save()} />
        </View>
      }
    >
      <TextField label="Title" value={title} onChangeText={setTitle} placeholder="What needs doing?" autoFocus={!task} error={errors.title} maxLength={200} />
      <View style={{ marginTop: 12 }}>
        <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="Details, links, sub-steps…" multiline error={errors.notes} />
      </View>

      <FormSection title="Priority">
        <ChipGroup options={PRIORITY_OPTIONS} value={priority} onChange={setPriority} />
      </FormSection>

      {task ? (
        <FormSection title="Status">
          <ChipGroup options={STATUS_OPTIONS} value={status} onChange={setStatus} />
        </FormSection>
      ) : null}

      <FormSection title="When">
        <DateTimeField label="Due" value={dueAt} onChange={setDueAt} />
        <DateTimeField label="Remind me" value={remindAt} onChange={setRemindAt} icon="notifications-outline" />
        <RecurrenceField value={recurrence} onChange={setRecurrence} />
        {errors.recurrence ? (
          <Text variant="small" color="danger">
            {errors.recurrence}
          </Text>
        ) : null}
      </FormSection>

      <FormSection title="Organize">
        <SelectField label="Project" value={projectId} options={projectOptions} onChange={setProjectId} icon="folder-outline" />
        <TextField label="Tags" value={tags} onChangeText={setTags} placeholder="work, home" helper="Separate tags with commas" />
        <TextField
          label="Estimate (minutes)"
          value={estimate}
          onChangeText={setEstimate}
          keyboardType="number-pad"
          placeholder="30"
          error={errors.estimateMinutes}
          helper="Used to find free slots when rescheduling"
        />
      </FormSection>
    </Screen>
  );
}

