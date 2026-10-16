import { useState } from 'react';
import { Image, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, EmptyState, Screen, ScreenHeader, Text, TextField } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { endpoints } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/client';
import { useOnline } from '@/lib/network';
import { toast } from '@/lib/toast';
import { PickError, pickImage, type PickedFile } from '@/features/workspace/upload';

export default function ScanScreen() {
  const router = useRouter();
  const online = useOnline();
  const qc = useQueryClient();
  const { radius, colors } = useTheme();
  const [scan, setScan] = useState<PickedFile | null>(null);
  const [name, setName] = useState('');

  const capture = async (source: 'camera' | 'library') => {
    try {
      const picked = await pickImage(source);
      if (picked) {
        setScan(picked);
        setName(picked.name.replace(/\.[a-z]+$/i, ''));
      }
    } catch (e) {
      toast.error(e instanceof PickError ? e.message : 'Could not open the camera');
    }
  };

  const upload = useMutation({
    mutationFn: async (summarize: boolean) => {
      if (!scan) throw new Error('Take a photo first');
      const ext = scan.mimeType.split('/')[1] ?? 'jpg';
      const doc = await endpoints.documents.upload({
        name: `${(name.trim() || 'Scan').slice(0, 180)}.${ext}`,
        mimeType: scan.mimeType,
        dataBase64: scan.dataBase64,
      });
      if (summarize) {
        try {
          await endpoints.documents.summarize(doc.id);
        } catch (e) {
          toast.error(`Saved, but the summary failed: ${errorMessage(e)}`);
        }
      }
      return doc;
    },
    onSuccess: (doc) => {
      void qc.invalidateQueries({ queryKey: ['documents'] });
      toast.success('Scan saved to Documents');
      router.replace(`/documents/${doc.id}`);
    },
    onError: (e) => toast.error(errorMessage(e, 'Upload failed')),
  });

  return (
    <Screen header={<ScreenHeader title="Document scanner" subtitle="Photograph a page, then let Aura read it" />}>
      {!scan ? (
        <>
          <EmptyState
            icon="scan-outline"
            title="Scan a document"
            body="Place the page on a flat surface with good light and fill the frame. Receipts, letters, notes and forms work well."
          />
          <View style={{ gap: 10 }}>
            <Button title="Open camera" icon="camera-outline" onPress={() => void capture('camera')} fullWidth />
            <Button title="Choose a photo instead" icon="images-outline" variant="secondary" onPress={() => void capture('library')} fullWidth />
          </View>
          <Text variant="small" color="textSubtle" align="center" style={{ marginTop: 12 }}>
            The camera is used only when you tap the button.
          </Text>
        </>
      ) : (
        <>
          <Image
            source={{ uri: scan.previewUri ?? `data:${scan.mimeType};base64,${scan.dataBase64}` }}
            style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt }}
            resizeMode="contain"
            accessibilityLabel="Scanned page preview"
          />
          <View style={{ gap: 12, marginTop: 16 }}>
            <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Electricity bill October" />
            <Button
              title={upload.isPending ? 'Saving & summarizing…' : 'Save & summarize'}
              icon="sparkles-outline"
              loading={upload.isPending && upload.variables === true}
              disabled={!online || upload.isPending}
              onPress={() => upload.mutate(true)}
              fullWidth
            />
            <Button title="Save without summary" variant="secondary" loading={upload.isPending && upload.variables === false} disabled={!online || upload.isPending} onPress={() => upload.mutate(false)} fullWidth />
            <Button title="Retake" variant="ghost" icon="camera-reverse-outline" disabled={upload.isPending} onPress={() => void capture('camera')} />
            {!online ? (
              <Card tone="warning">
                <Text variant="caption" color="warning">
                  You are offline. Saving scans needs a connection — keep this screen open and try again when you are back online.
                </Text>
              </Card>
            ) : null}
          </View>
        </>
      )}
    </Screen>
  );
}
