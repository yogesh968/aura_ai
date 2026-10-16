import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Button, Card, ErrorState, Icon, IconButton, LoadingState, Screen, ScreenHeader, SectionHeader, Text, TextField } from '@/components/ui';
import { endpoints } from '@/lib/api/endpoints';
import { ApiError, errorMessage } from '@/lib/api/client';
import { useOnline } from '@/lib/network';
import { formatDateTime } from '@/lib/format';
import { toast } from '@/lib/toast';
import { formatBytes } from '@/features/workspace/helpers';
import { docIcon, StatusBadge } from '@/features/workspace/documents';

interface QA {
  question: string;
  answer: string | null;
  error: string | null;
}

export default function DocumentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const online = useOnline();
  const qc = useQueryClient();
  const doc = useQuery({ queryKey: ['document', id], queryFn: () => endpoints.documents.get(id) });
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState<QA[]>([]);

  const summarize = useMutation({
    mutationFn: () => endpoints.documents.summarize(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['document', id] });
      void qc.invalidateQueries({ queryKey: ['documents'] });
      toast.success('Summary ready');
    },
    onError: (e) => {
      void qc.invalidateQueries({ queryKey: ['document', id] });
      toast.error(e instanceof ApiError && e.code === 'ai_unavailable' ? 'AI is not configured on the server, so summaries are unavailable.' : errorMessage(e, 'Could not summarize'));
    },
  });

  const ask = useMutation({
    mutationFn: (q: string) => endpoints.documents.ask(id, q),
    onMutate: (q) => setAnswers((a) => [{ question: q, answer: null, error: null }, ...a]),
    onSuccess: (res, q) => setAnswers((a) => a.map((x) => (x.question === q && x.answer == null && !x.error ? { ...x, answer: res.answer } : x))),
    onError: (e, q) => setAnswers((a) => a.map((x) => (x.question === q && x.answer == null && !x.error ? { ...x, error: errorMessage(e, 'Could not answer') } : x))),
  });

  const remove = () =>
    Alert.alert('Delete document?', 'It will be removed from your account and search. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await endpoints.documents.remove(id);
            void qc.invalidateQueries({ queryKey: ['documents'] });
            toast.success('Document deleted');
            router.back();
          } catch (e) {
            toast.error(errorMessage(e, 'Could not delete'));
          }
        },
      },
    ]);

  const submitQuestion = () => {
    const q = question.trim();
    if (!q) return;
    setQuestion('');
    ask.mutate(q);
  };

  if (doc.isLoading) return <Screen header={<ScreenHeader title="Document" />}><LoadingState /></Screen>;
  if (doc.error || !doc.data) return <Screen header={<ScreenHeader title="Document" />}><ErrorState error={doc.error ?? new Error('Not found')} onRetry={() => void doc.refetch()} /></Screen>;
  const d = doc.data;

  return (
    <Screen
      header={<ScreenHeader title={d.name} right={<IconButton icon="trash-outline" label="Delete document" onPress={remove} />} />}
      refreshing={doc.isRefetching}
      onRefresh={() => void doc.refetch()}
    >
      <Card>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Icon name={docIcon(d.mimeType)} size={32} color="primary" />
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="small" color="textMuted">
              {d.mimeType} · {formatBytes(d.sizeBytes)} · {formatDateTime(d.createdAt)}
            </Text>
            <StatusBadge status={d.status} />
          </View>
        </View>
        <Text variant="small" color="textSubtle" style={{ marginTop: 10 }}>
          The AI reads this document as untrusted content: it summarizes and answers questions, but never follows instructions written inside it.
        </Text>
      </Card>

      <SectionHeader title="Summary" />
      {d.summary ? (
        <Card>
          <Text variant="body" selectable>
            {d.summary}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Button title="Copy" size="sm" variant="secondary" icon="copy-outline" onPress={() => void Clipboard.setStringAsync(d.summary!).then(() => toast.success('Copied'))} />
            <Button title="Regenerate" size="sm" variant="ghost" icon="refresh" disabled={!online || summarize.isPending} onPress={() => summarize.mutate()} />
          </View>
        </Card>
      ) : (
        <Card tone="alt">
          <Text variant="caption" color="textMuted">
            {d.status === 'failed' ? 'The last summary attempt failed.' : 'No summary yet.'} Aura can summarize key points, dates, amounts and action items.
          </Text>
          <Button
            title={summarize.isPending ? 'Summarizing… this can take a minute' : 'Summarize'}
            icon="sparkles-outline"
            loading={summarize.isPending}
            disabled={!online}
            onPress={() => summarize.mutate()}
            style={{ marginTop: 12 }}
          />
          {!online ? (
            <Text variant="small" color="textMuted" style={{ marginTop: 6 }}>
              Needs an internet connection.
            </Text>
          ) : null}
        </Card>
      )}

      <SectionHeader title="Ask this document" />
      <TextField
        placeholder={online ? 'e.g. When is the payment due?' : 'Connect to the internet to ask questions'}
        value={question}
        onChangeText={setQuestion}
        editable={online}
        onSubmitEditing={submitQuestion}
        returnKeyType="send"
        right={<IconButton icon="send" label="Ask" onPress={submitQuestion} disabled={!online || !question.trim()} />}
      />
      <View style={{ gap: 10, marginTop: 12 }}>
        {answers.map((qa, i) => (
          <Card key={`${qa.question}-${i}`} tone="alt">
            <Text variant="bodyStrong">{qa.question}</Text>
            {qa.answer ? (
              <Text variant="body" style={{ marginTop: 6 }} selectable>
                {qa.answer}
              </Text>
            ) : qa.error ? (
              <Text variant="caption" color="danger" style={{ marginTop: 6 }}>
                {qa.error}
              </Text>
            ) : (
              <Text variant="caption" color="textMuted" style={{ marginTop: 6 }}>
                Reading the document…
              </Text>
            )}
          </Card>
        ))}
      </View>

      {d.textPreview ? (
        <>
          <SectionHeader title="Extracted text" />
          <Card tone="alt">
            <Text variant="caption" color="textMuted" selectable numberOfLines={30}>
              {d.textPreview}
            </Text>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
