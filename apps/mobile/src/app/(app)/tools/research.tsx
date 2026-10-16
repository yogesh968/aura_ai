import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { openLink } from '@/features/assistant/components/Markdown';
import { Button, Card, EmptyState, ErrorState, Icon, Screen, ScreenHeader, SectionHeader, Text, TextField } from '@/components/ui';
import { endpoints } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/client';
import { useOnline } from '@/lib/network';
import { ResultActions } from '@/features/workspace/ResultActions';

function hostOf(url: string) {
  return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] ?? url;
}

export default function ResearchScreen() {
  const online = useOnline();
  const [query, setQuery] = useState('');
  const [asked, setAsked] = useState('');
  const search = useMutation({
    mutationFn: (q: string) => endpoints.ai.webSearch(q),
  });

  const run = () => {
    const q = query.trim();
    if (q.length < 2) return;
    setAsked(q);
    search.mutate(q);
  };

  const unavailable = search.error instanceof ApiError && ['web_search_unavailable', 'ai_unavailable'].includes(search.error.code);

  return (
    <Screen header={<ScreenHeader title="Web research" subtitle="Live answers with sources" />}>
      <TextField
        icon="globe-outline"
        placeholder="e.g. Latest RBI repo rate decision"
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={run}
        returnKeyType="search"
        maxLength={500}
      />
      <Button title="Research" icon="search" loading={search.isPending} disabled={!online || query.trim().length < 2} onPress={run} style={{ marginTop: 12 }} fullWidth />
      {!online ? (
        <Text variant="small" color="textMuted" align="center" style={{ marginTop: 6 }}>
          Web research needs an internet connection.
        </Text>
      ) : null}

      {search.isPending ? (
        <Text variant="caption" color="textMuted" align="center" style={{ marginTop: 20 }}>
          Searching the web and reading sources… this can take up to a minute.
        </Text>
      ) : unavailable ? (
        <EmptyState icon="globe-outline" title="Web search isn't available" body="The server doesn't have a web-capable AI provider configured, so Aura can't look up live information. Nothing is guessed instead." />
      ) : search.error ? (
        <ErrorState error={search.error} onRetry={() => search.mutate(asked)} compact />
      ) : search.data ? (
        <>
          <Card style={{ marginTop: 16 }}>
            <Text variant="small" color="textMuted">
              {asked}
            </Text>
            <Text variant="body" selectable style={{ marginTop: 6 }}>
              {search.data.answer || 'No answer was returned.'}
            </Text>
            {search.data.answer ? (
              <ResultActions
                text={`${search.data.answer}\n\nSources:\n${search.data.sources.map((s, i) => `[${i + 1}] ${s.title} — ${s.url}`).join('\n')}`}
                noteTitle={`Research: ${asked.slice(0, 80)}`}
                speakable={false}
              />
            ) : null}
          </Card>
          <SectionHeader title={`Sources (${search.data.sources.length})`} />
          {search.data.sources.length === 0 ? (
            <Text variant="caption" color="warning">
              No sources were returned for this answer — treat it with caution.
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              {search.data.sources.map((s, i) => (
                <Pressable key={s.url} accessibilityRole="link" accessibilityLabel={`Source ${i + 1}: ${s.title}`} onPress={() => openLink(s.url)}>
                  <Card padded>
                    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                      <Text variant="bodyStrong" color="primary">
                        {i + 1}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <Text variant="body" numberOfLines={2}>
                          {s.title}
                        </Text>
                        <Text variant="small" color="textMuted" numberOfLines={1}>
                          {hostOf(s.url)}
                        </Text>
                      </View>
                      <Icon name="open-outline" size={16} color="textSubtle" />
                    </View>
                  </Card>
                </Pressable>
              ))}
            </View>
          )}
        </>
      ) : (
        <EmptyState icon="globe-outline" title="Ask about anything current" body="News, prices, schedules, facts — Aura searches the web and shows where each answer came from." compact />
      )}
    </Screen>
  );
}
