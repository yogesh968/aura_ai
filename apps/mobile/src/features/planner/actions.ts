import type { EntityMap, Reminder, Task } from '@aura/shared';
import { createEntity, deleteEntity, restoreEntity, updateEntity } from '@/lib/db/repo';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { errorMessage } from '@/lib/api/client';
import { nextRecurringTaskInput } from './logic';

/**
 * Toggle a task done/undone. Completing a recurring task also creates its
 * next instance (see nextRecurringTaskInput); Undo reverts both.
 */
export async function toggleTaskDone(task: Task) {
  try {
    if (task.status === 'done') {
      await updateEntity('task', task.id, { status: 'todo', completedAt: null });
      return;
    }
    const done = await updateEntity('task', task.id, { status: 'done', completedAt: new Date().toISOString() });
    haptics.success();
    const nextInput = nextRecurringTaskInput(task);
    const next = nextInput ? await createEntity('task', nextInput) : null;
    toast.success(next ? `Done · next one scheduled` : `Completed “${task.title}”`, {
      label: 'Undo',
      onPress: () => {
        void (async () => {
          await updateEntity('task', done.id, { status: task.status, completedAt: task.completedAt });
          if (next) await deleteEntity('task', next.id);
        })().catch((e) => toast.error(errorMessage(e)));
      },
    });
  } catch (e) {
    toast.error(errorMessage(e, "Couldn't update the task"));
  }
}

export async function toggleReminderDone(r: Reminder) {
  try {
    await updateEntity('reminder', r.id, { done: !r.done });
    if (!r.done) haptics.success();
  } catch (e) {
    toast.error(errorMessage(e, "Couldn't update the reminder"));
  }
}

/** Delete with an Undo toast. */
/** Deletes with an Undo toast. Resolves false (after showing the error) if the delete failed. */
export async function deleteWithUndo<T extends 'task' | 'event' | 'reminder' | 'project'>(type: T, record: EntityMap[T], label: string): Promise<boolean> {
  try {
    await deleteEntity(type, record.id);
  } catch (e) {
    toast.error(errorMessage(e, `Could not delete “${label}”`));
    return false;
  }
  toast.info(`Deleted “${label}”`, {
    label: 'Undo',
    onPress: () => void restoreEntity(type, record).catch((e) => toast.error(errorMessage(e))),
  });
  return true;
}
