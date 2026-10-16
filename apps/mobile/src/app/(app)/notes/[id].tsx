import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Share, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Note } from '@aura/shared';
import { Button, ErrorState, Icon, IconButton, LoadingState, Screen, ScreenHeader, Text, TextField } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { useEntity } from '@/lib/data';
import { createEntity, deleteEntity, getEntity, restoreEntity, updateEntity, ValidationError } from '@/lib/db/repo';
import { loadDraft, saveDraft } from '@/lib/db/database';
import { toast } from '@/lib/toast';
import { timeAgo } from '@/lib/format';
import { noteTitle, parseTags } from '@/features/workspace/helpers';

const DRAFT_KEY = 'note:new';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function NoteEditorScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const isNew = params.id === 'new';
  const { data: existing, isLoading, error } = useEntity('note', isNew ? undefined : params.id);

  if (!isNew && isLoading) return <Screen header={<ScreenHeader title="Note" />}><LoadingState /></Screen>;
  if (!isNew && (error || !existing)) {
    return (
      <Screen header={<ScreenHeader title="Note" />}>
        {error ? <ErrorState error={error} /> : <ErrorState error={new Error('This note was deleted or is not on this device yet.')} />}
      </Screen>
    );
  }
  return <Editor key={existing?.id ?? 'new'} initial={existing ?? null} />;
}

function Editor({ initial }: { initial: Note | null }) {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const [noteId, setNoteId] = useState<string | null>(initial?.id ?? null);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [tagsText, setTagsText] = useState(initial?.tags.join(', ') ?? '');
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(initial?.updatedAt ?? null);

  // Restore an unsaved draft for brand-new notes.
  useEffect(() => {
    if (initial) return;
    void loadDraft(DRAFT_KEY).then((raw) => {
      if (!raw) return;
      try {
        const d = JSON.parse(raw) as { title?: string; content?: string; tags?: string };
        setTitle(d.title ?? '');
        setContent(d.content ?? '');
        setTagsText(d.tags ?? '');
      } catch {
        /* ignore corrupt draft */
      }
    });
  }, [initial]);

  // Autosave: edits bump editSeq; persist() writes the latest fields (kept in a ref) and only
  // clears 'dirty' if nothing changed while saving. Saves are serialized, debounced by 800 ms,
  // and flushed when the editor closes so the last keystrokes are never dropped.
  const latest = useRef({ title, content, tagsText, pinned });
  useEffect(() => {
    latest.current = { title, content, tagsText, pinned };
  }, [title, content, tagsText, pinned]);
  const idRef = useRef<string | null>(initial?.id ?? null);
  const editSeq = useRef(0);
  const savedSeq = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const discarded = useRef(false);

  const persist = useCallback(async (): Promise<void> => {
    while (inFlight.current) await inFlight.current;
    if (discarded.current || savedSeq.current === editSeq.current) return;
    const seq = editSeq.current;
    const run = (async () => {
      const f = latest.current;
      const fields = { title: f.title.trim(), content: f.content, tags: parseTags(f.tagsText), pinned: f.pinned };
      if (!idRef.current) {
        await saveDraft(DRAFT_KEY, JSON.stringify({ title: f.title, content: f.content, tags: f.tagsText }));
        if (!fields.title && !f.content.trim()) {
          savedSeq.current = seq;
          return;
        }
      }
      setSaveState('saving');
      try {
        const saved = idRef.current
          ? await updateEntity('note', idRef.current, fields)
          : await createEntity('note', { ...fields, kind: 'note' });
        if (!idRef.current) {
          idRef.current = saved.id;
          setNoteId(saved.id);
          void saveDraft(DRAFT_KEY, '');
        }
        savedSeq.current = seq;
        setSavedAt(saved.updatedAt);
        setSaveState('saved');
        if (editSeq.current === seq) setDirty(false);
      } catch (e) {
        setSaveState('error');
        toast.error(e instanceof ValidationError ? e.message : 'Could not save the note');
      }
    })();
    inFlight.current = run;
    try {
      await run;
    } finally {
      inFlight.current = null;
    }
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => void persist(), 800);
    return () => clearTimeout(timer);
  }, [dirty, title, content, tagsText, pinned, persist]);

  // Flush unsaved edits when leaving the screen.
  useEffect(() => () => void persist(), [persist]);

  const edit = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    editSeq.current += 1;
    setDirty(true);
  };

  const remove = () => {
    if (!noteId) {
      discarded.current = true;
      void saveDraft(DRAFT_KEY, '');
      router.back();
      return;
    }
    Alert.alert('Delete note?', 'You can undo right after deleting.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const snapshot = await getEntity('note', noteId);
            await deleteEntity('note', noteId);
            discarded.current = true;
            router.back();
            if (snapshot) {
              toast.info('Note deleted', {
                label: 'Undo',
                onPress: () => void restoreEntity('note', snapshot).catch(() => toast.error('Could not restore the note')),
              });
            }
          } catch {
            toast.error('Could not delete the note');
          }
        },
      },
    ]);
  };

  const share = () => {
    const body = [title.trim(), content.trim()].filter(Boolean).join('\n\n');
    if (!body) return toast.info('Nothing to share yet');
    void Share.share({ message: body, title: noteTitle({ title, content }) });
  };

  const summarize = () => {
    const body = content.trim();
    if (!body) return toast.info('Write something first');
    const prompt = `Summarize this note in a few bullet points and list any action items:\n\nTitle: ${title.trim() || 'Untitled'}\n\n${body.slice(0, 4000)}`;
    router.push(`/chat/new?prompt=${encodeURIComponent(prompt)}`);
  };

  const status =
    saveState === 'saving'
      ? 'Saving…'
      : saveState === 'error'
        ? 'Not saved — will retry on next edit'
        : dirty
          ? noteId ? 'Editing…' : 'Draft kept on this phone'
          : savedAt
            ? `Saved ${timeAgo(savedAt)}`
            : 'New note';

  return (
    <Screen
      header={
        <ScreenHeader
          title={noteId ? 'Note' : 'New note'}
          subtitle={status}
          right={
            <>
              <IconButton
                icon={pinned ? 'pin' : 'pin-outline'}
                label={pinned ? 'Unpin note' : 'Pin note'}
                color={pinned ? colors.primary : undefined}
                onPress={() => edit(setPinned)(!pinned)}
              />
              <IconButton icon="share-outline" label="Share note" onPress={share} />
              <IconButton icon="trash-outline" label="Delete note" onPress={remove} />
            </>
          }
        />
      }
    >
      <TextInput
        value={title}
        onChangeText={edit(setTitle)}
        placeholder="Title"
        placeholderTextColor={colors.textSubtle}
        accessibilityLabel="Note title"
        style={[typography.title, { color: colors.text, paddingVertical: 8 }]}
        maxLength={200}
        returnKeyType="next"
      />
      <TextInput
        value={content}
        onChangeText={edit(setContent)}
        placeholder="Start writing…"
        placeholderTextColor={colors.textSubtle}
        accessibilityLabel="Note content"
        multiline
        autoFocus={!initial}
        textAlignVertical="top"
        style={[typography.body, { color: colors.text, minHeight: 240, paddingVertical: 8 }]}
      />
      <View style={{ marginTop: 16, gap: 16 }}>
        <TextField label="Tags" icon="pricetags-outline" placeholder="work, ideas" value={tagsText} onChangeText={edit(setTagsText)} autoCapitalize="none" helper="Separate tags with commas" />
        <Button title="Summarize with Aura" icon="sparkles-outline" variant="soft" onPress={summarize} />
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Icon name="cloud-done-outline" size={14} color="textSubtle" />
          <Text variant="small" color="textSubtle" style={{ flex: 1 }}>
            Notes save automatically on this phone and sync when online. Aura can search them for you.
          </Text>
        </View>
      </View>
    </Screen>
  );
}
