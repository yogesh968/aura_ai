import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, EmptyState, ErrorState, Icon, LoadingState, Screen, ScreenHeader, Sheet, StaleBanner, Text } from '@/components/ui';
import { endpoints } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/client';
import { useCachedQuery } from '@/lib/data';
import { useOnline } from '@/lib/network';
import { timeAgo } from '@/lib/format';
import { toast } from '@/lib/toast';
import { formatBytes } from '@/features/workspace/helpers';
import { docIcon, StatusBadge } from '@/features/workspace/documents';
import { PickError, pickDocumentFile, pickImage, type PickedFile } from '@/features/workspace/upload';

export default function DocumentsScreen() {
  const router = useRouter();
  const online = useOnline();
  const qc = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const list = useCachedQuery(['documents'], () => endpoints.documents.list());

  const upload = useMutation({
    mutationFn: (file: PickedFile) => endpoints.documents.upload({ name: file.name, mimeType: file.mimeType, dataBase64: file.dataBase64 }),
    onSuccess: (doc) => {
      void qc.invalidateQueries({ queryKey: ['documents'] });
      toast.success(`Uploaded “${doc.name}”`);
      router.push(`/documents/${doc.id}`);
    },
    onError: (e) => toast.error(errorMessage(e, 'Upload failed')),
  });

  const pick = async (source: 'file' | 'camera' | 'library') => {
    setPickerOpen(false);
    try {
      const file = source === 'file' ? await pickDocumentFile() : await pickImage(source);
      if (file) upload.mutate(file);
    } catch (e) {
      toast.error(e instanceof PickError ? e.message : 'Could not read that file');
    }
  };

  const docs = list.data?.data ?? [];

  return (
    <Screen
      header={<ScreenHeader title="Documents" subtitle="Your searchable knowledge base" />}
      refreshing={list.isRefetching}
      onRefresh={() => void list.refetch()}
      footer={
        <View style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
          <Button
            title={upload.isPending ? 'Uploading…' : 'Add document'}
            icon="cloud-upload-outline"
            loading={upload.isPending}
            disabled={!online}
            onPress={() => setPickerOpen(true)}
            fullWidth
          />
          {!online ? (
            <Text variant="small" color="textMuted" align="center" style={{ marginTop: 6 }}>
              Uploading needs an internet connection.
            </Text>
          ) : null}
        </View>
      }
    >
      <StaleBanner cachedAt={list.data?.cachedAt} />
      {list.isLoading ? (
        <LoadingState compact />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : docs.length === 0 ? (
        <EmptyState
          icon="folder-open-outline"
          title="No documents yet"
          body="Upload PDFs, text files or photos of documents. Aura can summarize them, answer questions and find them when you search."
        />
      ) : (
        <View style={{ gap: 10 }}>
          {docs.map((d) => (
            <Card key={d.id} onPress={() => router.push(`/documents/${d.id}`)} accessibilityLabel={d.name}>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <Icon name={docIcon(d.mimeType)} size={26} color="primary" />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {d.name}
                  </Text>
                  <Text variant="small" color="textMuted">
                    {formatBytes(d.sizeBytes)} · {timeAgo(d.createdAt)}
                  </Text>
                  <StatusBadge status={d.status} />
                </View>
              </View>
              {d.summary ? (
                <Text variant="caption" color="textMuted" numberOfLines={2} style={{ marginTop: 8 }}>
                  {d.summary}
                </Text>
              ) : null}
            </Card>
          ))}
        </View>
      )}

      <Sheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title="Add a document">
        <View style={{ gap: 10, paddingBottom: 8 }}>
          <Button title="Choose a file (PDF, text, image)" icon="document-outline" variant="secondary" onPress={() => void pick('file')} fullWidth />
          <Button title="Scan with camera" icon="camera-outline" variant="secondary" onPress={() => void pick('camera')} fullWidth />
          <Button title="Pick a photo" icon="images-outline" variant="secondary" onPress={() => void pick('library')} fullWidth />
          <Text variant="small" color="textMuted">
            Files up to 8 MB. Documents are stored in your account and read by the AI as untrusted content — instructions inside them are never followed.
          </Text>
        </View>
      </Sheet>
    </Screen>
  );
}
