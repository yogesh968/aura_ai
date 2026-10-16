import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { memoryCategorySchema, type Memory } from '@aura/shared';
import {
  Badge,
  Button,
  Card,
  ChipGroup,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  Screen,
  ScreenHeader,
  SectionHeader,
  Sheet,
  Text,
  TextField,
  ToggleRow,
} from '@/components/ui';
import { endpoints } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/client';
import { useSettingsStore } from '@/lib/settings';
import { timeAgo } from '@/lib/format';
import { toast } from '@/lib/toast';
import { savePreferences } from '@/features/account/prefs';

type Category = Memory['category'];
const CATEGORIES = memoryCategorySchema.options;
const CATEGORY_LABEL: Record<Category, string> = {
  preference: 'Preference',
  fact: 'Fact',
  person: 'Person',
  goal: 'Goal',
  routine: 'Routine',
  other: 'Other',
};

export default function MemoryScreen() {
  const qc = useQueryClient();
  const memoryEnabled = useSettingsStore((s) => s.preferences.memoryEnabled);
  const [filter, setFilter] = useState<'all' | Category>('all');
  const [editing, setEditing] = useState<Memory | 'new' | null>(null);
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<Category>('other');
  const [formError, setFormError] = useState<string | null>(null);

  const list = useQuery({ queryKey: ['memories'], queryFn: endpoints.memories.list });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['memories'] });

  const save = useMutation({
    mutationFn: async () => {
      const text = content.trim();
      if (text.length < 2) throw new Error('Write at least a couple of words');
      if (editing === 'new') return endpoints.memories.create({ content: text, category });
      if (editing) return endpoints.memories.update(editing.id, { content: text, category });
      throw new Error('Nothing to save');
    },
    onSuccess: () => {
      toast.success(editing === 'new' ? 'Memory added' : 'Memory updated');
      setEditing(null);
      void invalidate();
    },
    onError: (e) => setFormError(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => endpoints.memories.remove(id),
    onSuccess: () => {
      toast.success('Memory deleted');
      void invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const removeAll = useMutation({
    mutationFn: endpoints.memories.removeAll,
    onSuccess: (r) => {
      toast.success(`Deleted ${r.deleted} memories`);
      void invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const filtered = useMemo(() => (list.data ?? []).filter((m) => filter === 'all' || m.category === filter), [list.data, filter]);

  const openEditor = (m: Memory | 'new') => {
    setEditing(m);
    setContent(m === 'new' ? '' : m.content);
    setCategory(m === 'new' ? 'other' : m.category);
    setFormError(null);
  };

  const confirmDelete = (m: Memory) =>
    Alert.alert('Delete this memory?', `“${m.content}”`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(m.id) },
    ]);

  const confirmDeleteAll = () =>
    Alert.alert('Delete all memories?', 'AURA will forget everything it has learned about you.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Are you sure?', 'This cannot be undone.', [
            { text: 'Keep them', style: 'cancel' },
            { text: 'Delete all', style: 'destructive', onPress: () => removeAll.mutate() },
          ]),
      },
    ]);

  const toggleMemory = async (v: boolean) => {
    try {
      await savePreferences({ memoryEnabled: v });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Screen
      header={<ScreenHeader title="Memory" right={<IconButton icon="add" label="Add memory" onPress={() => openEditor('new')} />} />}
      refreshing={list.isRefetching}
      onRefresh={() => void list.refetch()}
    >
      <Card tone="primary" style={{ gap: 8 }}>
        <Text variant="subheading">How memory works</Text>
        <Text variant="caption" color="textMuted">
          Memories are short facts that help AURA personalize answers, like “prefers vegetarian food”. AURA only saves a memory after you confirm it in chat, and the relevant ones are shared with the AI when you chat. Never store passwords or card numbers here.
        </Text>
      </Card>
      <ToggleRow
        label="Use memory"
        description={memoryEnabled ? 'AURA uses your saved memories in conversations' : 'Memories are kept but not used or added'}
        icon="bulb-outline"
        value={memoryEnabled}
        onChange={(v) => void toggleMemory(v)}
      />

      <SectionHeader title="Saved memories" />
      <ChipGroup
        options={[{ value: 'all' as const, label: 'All' }, ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))]}
        value={filter}
        onChange={setFilter}
      />
      <View style={{ marginTop: 12, gap: 10 }}>
        {list.isLoading ? (
          <LoadingState compact />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} compact />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="bulb-outline"
            title={filter === 'all' ? 'Nothing remembered yet' : `No ${CATEGORY_LABEL[filter as Category].toLowerCase()} memories`}
            body="Tell AURA things like “remember that my sister’s birthday is 3 May”, or add one here."
            actionLabel="Add memory"
            onAction={() => openEditor('new')}
            compact
          />
        ) : (
          filtered.map((m, i) => (
            <Animated.View key={m.id} entering={FadeInDown.duration(200).delay(Math.min(i, 8) * 30)} layout={LinearTransition}>
              <Card onPress={() => openEditor(m)} accessibilityLabel={`Edit memory: ${m.content}`} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text variant="body">{m.content}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <Badge label={CATEGORY_LABEL[m.category]} tone="primary" />
                    <Text variant="small" color="textSubtle">
                      {`${m.source === 'assistant' ? 'Saved from chat' : 'Added by you'} · ${timeAgo(m.updatedAt)}`}
                    </Text>
                  </View>
                </View>
                <IconButton icon="trash-outline" label="Delete memory" color={undefined} onPress={() => confirmDelete(m)} />
              </Card>
            </Animated.View>
          ))
        )}
      </View>

      {(list.data?.length ?? 0) > 0 ? (
        <Button title="Delete all memories" variant="ghost" icon="trash-outline" loading={removeAll.isPending} onPress={confirmDeleteAll} style={{ marginTop: 24, alignSelf: 'center' }} />
      ) : null}

      <Sheet
        visible={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New memory' : 'Edit memory'}
        footer={<Button title="Save" fullWidth loading={save.isPending} onPress={() => save.mutate()} />}
      >
        <View style={{ gap: 14, paddingBottom: 8 }}>
          <TextField label="What should AURA remember?" value={content} onChangeText={setContent} multiline maxLength={500} error={formError} placeholder="e.g. I'm allergic to peanuts" />
          <ChipGroup options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} value={category} onChange={setCategory} />
        </View>
      </Sheet>
    </Screen>
  );
}
