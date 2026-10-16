import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Note } from '@aura/shared';
import { Button, Card, EmptyState, IconButton, LoadingState, Screen, ScreenHeader, SectionHeader, Sheet, Text, TextField } from '@/components/ui';
import { useEntities } from '@/lib/data';
import { loadDraft, saveDraft } from '@/lib/db/database';
import { createEntity, deleteEntity, restoreEntity, updateEntity } from '@/lib/db/repo';
import { formatTime, relativeDay } from '@/lib/format';
import { toast } from '@/lib/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { MoodPicker } from '@/features/life/components';
import { MOOD_FACES } from '@/features/life/helpers';

const DRAFT_KEY = 'journal:new';

export default function JournalScreen() {
  const { colors } = useTheme();
  const { data: notes, isLoading } = useEntities('note');
  const [text, setText] = useState('');
  const [mood, setMood] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDraft = useRef<string | null>(null);

  useEffect(() => {
    void loadDraft(DRAFT_KEY).then((d) => d && setText(d));
  }, []);

  const onChange = (t: string) => {
    setText(t);
    if (draftTimer.current) clearTimeout(draftTimer.current);
    pendingDraft.current = t;
    draftTimer.current = setTimeout(() => {
      pendingDraft.current = null;
      void saveDraft(DRAFT_KEY, t);
    }, 400);
  };

  const cancelPendingDraft = () => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = null;
    pendingDraft.current = null;
  };

  // On leave, write a still-pending draft right away instead of dropping it.
  useEffect(
    () => () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
      if (pendingDraft.current !== null) void saveDraft(DRAFT_KEY, pendingDraft.current);
    },
    [],
  );

  const entries = useMemo(() => (notes ?? []).filter((n) => n.kind === 'journal').sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [notes]);

  const save = async () => {
    if (!text.trim()) return;
    // A queued draft write must not resurrect the entry after it's saved.
    cancelPendingDraft();
    setSaving(true);
    try {
      await createEntity('note', { title: '', content: text.trim(), kind: 'journal', mood, tags: ['journal'] });
      await saveDraft(DRAFT_KEY, '');
      setText('');
      setMood(null);
      toast.success('Journal entry saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const remove = (n: Note) =>
    Alert.alert('Delete entry?', 'This journal entry will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteEntity('note', n.id);
            toast.success('Entry deleted', {
              label: 'Undo',
              onPress: () => void restoreEntity('note', n).catch(() => toast.error('Could not restore the entry')),
            });
          } catch {
            toast.error('Could not delete the entry');
          }
        },
      },
    ]);

  return (
    <Screen header={<ScreenHeader title="Journal" subtitle="Private notes on your days" />}>
      <Card style={{ gap: 12 }}>
        <Text variant="subheading">{relativeDay(new Date())}</Text>
        <MoodPicker value={mood} onChange={(v) => setMood(mood === v ? null : v)} />
        <TextField placeholder="How was your day? What are you grateful for?" multiline value={text} onChangeText={onChange} maxLength={20000} accessibilityLabel="Journal entry" />
        <Button title="Save entry" icon="checkmark" onPress={() => void save()} loading={saving} disabled={!text.trim()} />
        {text.trim() ? (
          <Text variant="small" color="textSubtle">
            Draft saved on this phone automatically.
          </Text>
        ) : null}
      </Card>

      <SectionHeader title="Past entries" />
      {isLoading ? <LoadingState compact /> : null}
      {!isLoading && entries.length === 0 ? <EmptyState compact icon="journal-outline" title="No entries yet" body="Write a few lines a day — it adds up." /> : null}
      <View style={{ gap: 10 }}>
        {entries.map((n, i) => (
          <Animated.View key={n.id} entering={FadeInDown.delay(Math.min(i, 8) * 30).duration(200)}>
            <Card onPress={() => setEditing(n)} accessibilityLabel={`Journal entry from ${relativeDay(n.createdAt)}. Edit`} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
                  {relativeDay(n.createdAt)} · {formatTime(n.createdAt)}
                </Text>
                {n.mood ? <Text style={{ fontSize: 18 }}>{MOOD_FACES[n.mood - 1]}</Text> : null}
                <IconButton icon="trash-outline" label="Delete entry" color={colors.textSubtle} size={18} onPress={() => remove(n)} />
              </View>
              <Text variant="body" numberOfLines={6}>
                {n.content}
              </Text>
            </Card>
          </Animated.View>
        ))}
      </View>
      {editing ? <EditSheet key={editing.id} note={editing} onClose={() => setEditing(null)} /> : null}
    </Screen>
  );
}

function EditSheet({ note, onClose }: { note: Note; onClose: () => void }) {
  const [text, setText] = useState(note.content);
  const [mood, setMood] = useState<number | null>(note.mood);
  const save = async () => {
    try {
      await updateEntity('note', note.id, { content: text.trim(), mood });
      toast.success('Entry updated');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    }
  };
  return (
    <Sheet visible onClose={onClose} title="Edit entry" footer={<Button title="Save" onPress={() => void save()} disabled={!text.trim()} fullWidth />}>
      <View style={{ gap: 12 }}>
        <MoodPicker value={mood} onChange={(v) => setMood(mood === v ? null : v)} />
        <TextField multiline value={text} onChangeText={setText} maxLength={20000} accessibilityLabel="Journal entry" />
      </View>
    </Sheet>
  );
}
