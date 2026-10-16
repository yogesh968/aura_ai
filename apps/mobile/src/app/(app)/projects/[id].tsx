import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Project } from '@aura/shared';
import {
  Button,
  Card,
  ChipGroup,
  DateTimeField,
  EmptyState,
  LoadingState,
  ProgressBar,
  Screen,
  ScreenHeader,
  SectionHeader,
  Text,
  TextField,
} from '@/components/ui';
import { useEntities, useEntity } from '@/lib/data';
import { createEntity, updateEntity } from '@/lib/db/repo';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { deleteWithUndo } from '@/features/planner/actions';
import { TaskRow } from '@/features/planner/components';
import { DeleteButton, FormSection, handleSaveError } from '@/features/planner/forms';
import { filterTasks } from '@/features/planner/logic';

const STATUS_OPTIONS = [
  { value: 'active' as const, label: 'Active' },
  { value: 'completed' as const, label: 'Completed' },
  { value: 'archived' as const, label: 'Archived' },
];

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const existing = useEntity('project', isNew ? undefined : id);

  if (!isNew && existing.isLoading) return <Screen header={<ScreenHeader title="Project" />}><LoadingState /></Screen>;
  if (!isNew && !existing.data) {
    return (
      <Screen header={<ScreenHeader title="Project" />}>
        <EmptyState icon="help-circle-outline" title="Project not found" body="It may have been deleted on another device." />
      </Screen>
    );
  }
  return <ProjectView key={id} project={existing.data ?? null} />;
}

function ProjectView({ project }: { project: Project | null }) {
  const router = useRouter();
  const tasks = useEntities('task');
  const [editing, setEditing] = useState(!project);
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [deadline, setDeadline] = useState<Date | null>(project?.deadline ? new Date(project.deadline) : null);
  const [status, setStatus] = useState<Project['status']>(project?.status ?? 'active');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const projectTasks = useMemo(() => (tasks.data ?? []).filter((t) => project && t.projectId === project.id), [tasks.data, project]);
  const open = filterTasks(projectTasks, 'all');
  const done = filterTasks(projectTasks, 'done');
  const total = open.length + done.length;

  const save = async () => {
    if (!name.trim()) {
      setErrors({ name: 'Give the project a name' });
      return;
    }
    setSaving(true);
    const input = { name: name.trim(), description: description.trim() || null, deadline: deadline?.toISOString() ?? null, status };
    try {
      if (project) {
        await updateEntity('project', project.id, input);
        setEditing(false);
        toast.success('Project updated');
      } else {
        const created = await createEntity('project', input);
        toast.success('Project created');
        router.replace(`/projects/${created.id}`);
      }
      haptics.success();
    } catch (e) {
      handleSaveError(e, setErrors);
    } finally {
      setSaving(false);
    }
  };

  const breakdownPrompt = project
    ? `Break down my project "${project.name}"${project.description ? ` (${project.description})` : ''}${project.deadline ? `, due ${new Date(project.deadline).toDateString()},` : ''} into tasks with due dates and add them to the project.`
    : '';

  return (
    <Screen
      header={
        <ScreenHeader
          title={project ? (editing ? 'Edit project' : project.name) : 'New project'}
          right={
            project ? (
              <>
                {!editing ? <Button title="Edit" size="sm" variant="ghost" onPress={() => setEditing(true)} /> : null}
                <DeleteButton
                  label="project"
                  onConfirm={async () => {
                    if (await deleteWithUndo('project', project, project.name)) router.back();
                  }}
                />
              </>
            ) : null
          }
        />
      }
    >
      {editing ? (
        <View>
          <TextField label="Name" value={name} onChangeText={setName} placeholder="Website relaunch" autoFocus={!project} error={errors.name} maxLength={200} />
          <FormSection>
            <TextField label="Description" value={description} onChangeText={setDescription} placeholder="What does done look like?" multiline />
            <DateTimeField label="Deadline" value={deadline} onChange={setDeadline} mode="date" icon="flag-outline" />
            {project ? <ChipGroup options={STATUS_OPTIONS} value={status} onChange={setStatus} /> : null}
          </FormSection>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
            {project ? <Button title="Cancel" variant="secondary" onPress={() => setEditing(false)} style={{ flex: 1 }} /> : null}
            <Button title={project ? 'Save' : 'Create project'} loading={saving} onPress={() => void save()} style={{ flex: 1 }} />
          </View>
        </View>
      ) : project ? (
        <Card style={{ gap: 10 }}>
          {project.description ? (
            <Text variant="body" color="textMuted">
              {project.description}
            </Text>
          ) : null}
          <ProgressBar value={total ? done.length / total : 0} label="Project progress" />
          <Text variant="small" color="textMuted">
            {`${done.length}/${total} tasks done${project.deadline ? ` · deadline ${new Date(project.deadline).toDateString()}` : ''} · ${project.status}`}
          </Text>
        </Card>
      ) : null}

      {project && !editing ? (
        <>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <Button title="Add task" icon="add" variant="soft" style={{ flex: 1 }} onPress={() => router.push(`/task/new?projectId=${project.id}`)} />
            <Button
              title="Break down with Aura"
              icon="sparkles-outline"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => router.push(`/chat/new?prompt=${encodeURIComponent(breakdownPrompt)}`)}
            />
          </View>
          <SectionHeader title={`Open · ${open.length}`} />
          <Card padded={false} style={{ paddingHorizontal: 12, paddingVertical: 2 }}>
            {open.length === 0 ? (
              <EmptyState compact icon="checkmark-done-outline" title={total ? 'All tasks done!' : 'No tasks yet'} />
            ) : (
              open.map((t) => <TaskRow key={t.id} task={t} />)
            )}
          </Card>
          {done.length > 0 ? (
            <>
              <SectionHeader title={`Done · ${done.length}`} />
              <Card padded={false} style={{ paddingHorizontal: 12, paddingVertical: 2 }}>
                {done.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </Card>
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
