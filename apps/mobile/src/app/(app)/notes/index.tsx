import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Card, Chip, EmptyState, ErrorState, Fab, Icon, IconButton, LoadingState, Screen, ScreenHeader, Text, TextField } from '@/components/ui';
import { useEntities } from '@/lib/data';
import { timeAgo } from '@/lib/format';
import { allTags, noteTitle, searchNotes } from '@/features/workspace/helpers';

export default function NotesScreen() {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useEntities('note');
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);

  const notes = useMemo(() => searchNotes(data ?? [], query, tag), [data, query, tag]);
  const tags = useMemo(() => allTags(data ?? []), [data]);
  const total = (data ?? []).filter((n) => n.kind === 'note').length;

  return (
    <View style={{ flex: 1 }}>
      <Screen
        header={
          <ScreenHeader
            title="Notes"
            subtitle={total ? `${total} note${total === 1 ? '' : 's'}` : undefined}
            right={<IconButton icon="search-outline" label="Search everything" onPress={() => router.push('/search')} />}
          />
        }
      >
        <TextField icon="filter-outline" placeholder="Filter notes" value={query} onChangeText={setQuery} returnKeyType="search" autoCorrect={false} accessibilityLabel="Filter notes" />
        {tags.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 12 }}>
            <Chip label="All" selected={!tag} onPress={() => setTag(null)} />
            {tags.map((t) => (
              <Chip key={t} label={`#${t}`} selected={tag === t} onPress={() => setTag(tag === t ? null : t)} />
            ))}
          </ScrollView>
        ) : (
          <View style={{ height: 12 }} />
        )}

        {isLoading ? (
          <LoadingState compact />
        ) : error ? (
          <ErrorState error={error} onRetry={() => void refetch()} compact />
        ) : notes.length === 0 ? (
          total === 0 ? (
            <EmptyState icon="document-text-outline" title="No notes yet" body="Capture ideas, lists and anything you want Aura to find later. Notes work offline." actionLabel="Write a note" onAction={() => router.push('/notes/new')} />
          ) : (
            <EmptyState icon="search-outline" title="No matching notes" body="Try different words or clear the tag filter." compact />
          )
        ) : (
          <View style={{ gap: 10 }}>
            {notes.map((n, i) => (
              <Animated.View key={n.id} entering={FadeInDown.duration(200).delay(Math.min(i, 10) * 25)} layout={LinearTransition}>
                <Card onPress={() => router.push(`/notes/${n.id}`)} accessibilityLabel={`${noteTitle(n)}${n.pinned ? ', pinned' : ''}`}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {n.pinned ? <Icon name="pin" size={14} color="primary" /> : null}
                    <Text variant="subheading" numberOfLines={1} style={{ flex: 1 }}>
                      {noteTitle(n)}
                    </Text>
                    <Text variant="small" color="textSubtle">
                      {timeAgo(n.updatedAt)}
                    </Text>
                  </View>
                  {n.content.trim() ? (
                    <Text variant="caption" color="textMuted" numberOfLines={2} style={{ marginTop: 4 }}>
                      {n.title.trim() ? n.content.trim() : n.content.trim().split('\n').slice(1).join(' ') || ' '}
                    </Text>
                  ) : null}
                  {n.tags.length ? (
                    <Text variant="small" color="primary" style={{ marginTop: 6 }} numberOfLines={1}>
                      {n.tags.map((t) => `#${t}`).join('  ')}
                    </Text>
                  ) : null}
                </Card>
              </Animated.View>
            ))}
          </View>
        )}
      </Screen>
      <Fab label="New note" icon="create-outline" onPress={() => router.push('/notes/new')} bottom={32} />
    </View>
  );
}
