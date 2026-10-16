import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { KnowledgeSearchResult } from '@aura/shared';
import { Badge, Card, EmptyState, ErrorState, Icon, LoadingState, Screen, ScreenHeader, Text, TextField, type IconName } from '@/components/ui';
import { endpoints } from '@/lib/api/endpoints';
import { isNetworkError } from '@/lib/api/client';
import { useEntities } from '@/lib/data';
import { useOnline } from '@/lib/network';
import { noteTitle, searchNotes } from '@/features/workspace/helpers';

const KIND: Record<KnowledgeSearchResult['kind'], { icon: IconName; label: string }> = {
  note: { icon: 'document-text-outline', label: 'Note' },
  document: { icon: 'folder-open-outline', label: 'Document' },
  memory: { icon: 'bulb-outline', label: 'Memory' },
};

/** Render «highlighted» snippets from the server's ts_headline output. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/(«[^»]*»)/g).filter(Boolean);
  return (
    <Text variant="caption" color="textMuted" numberOfLines={3} style={{ marginTop: 4 }}>
      {parts.map((p, i) =>
        p.startsWith('«') ? (
          <Text key={i} variant="caption" color="text" weight="700">
            {p.slice(1, -1)}
          </Text>
        ) : (
          p
        ),
      )}
    </Text>
  );
}

export default function SearchScreen() {
  const router = useRouter();
  const online = useOnline();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const notes = useEntities('note');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const remote = useQuery({
    queryKey: ['knowledge-search', debounced],
    queryFn: () => endpoints.knowledge.search(debounced, 20),
    enabled: online && debounced.length >= 2,
    staleTime: 60_000,
  });

  const useLocal = !online || (remote.error && isNetworkError(remote.error));
  const localResults = useMemo(() => (useLocal && debounced ? searchNotes(notes.data ?? [], debounced).slice(0, 30) : []), [useLocal, debounced, notes.data]);

  const open = (r: Pick<KnowledgeSearchResult, 'kind' | 'id'>) => {
    if (r.kind === 'note') router.push(`/notes/${r.id}`);
    else if (r.kind === 'document') router.push(`/documents/${r.id}`);
    else router.push('/settings/memory');
  };

  return (
    <Screen header={<ScreenHeader title="Search" subtitle="Notes, documents and memories" />}>
      <TextField icon="search-outline" placeholder="Search everything you saved" value={query} onChangeText={setQuery} autoFocus returnKeyType="search" autoCorrect={false} />
      <View style={{ marginTop: 16, gap: 10 }}>
        {debounced.length < 2 ? (
          <EmptyState icon="search-outline" title="Find anything" body="Search across your notes, uploaded documents and saved memories. Works in English, Hindi and Hinglish." compact />
        ) : useLocal ? (
          <>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <Icon name="cloud-offline-outline" size={14} color="warning" />
              <Text variant="small" color="warning">
                Offline — searching notes on this phone only.
              </Text>
            </View>
            {localResults.length === 0 ? (
              <EmptyState icon="document-text-outline" title="No matching notes" compact />
            ) : (
              localResults.map((n) => (
                <Card key={n.id} onPress={() => open({ kind: 'note', id: n.id })} accessibilityLabel={noteTitle(n)}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {noteTitle(n)}
                  </Text>
                  <Text variant="caption" color="textMuted" numberOfLines={2} style={{ marginTop: 4 }}>
                    {n.content}
                  </Text>
                </Card>
              ))
            )}
          </>
        ) : remote.isLoading ? (
          <LoadingState compact label="Searching…" />
        ) : remote.error ? (
          <ErrorState error={remote.error} onRetry={() => void remote.refetch()} compact />
        ) : (remote.data ?? []).length === 0 ? (
          <EmptyState icon="search-outline" title="Nothing found" body="Try fewer or different words." compact />
        ) : (
          remote.data!.map((r) => (
            <Card key={`${r.kind}-${r.id}`} onPress={() => open(r)} accessibilityLabel={`${KIND[r.kind].label}: ${r.title}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name={KIND[r.kind].icon} size={18} color="primary" />
                <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                  {r.title}
                </Text>
                <Badge label={KIND[r.kind].label} />
              </View>
              <Snippet text={r.snippet} />
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}
