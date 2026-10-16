import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Icon, IconButton, ListItem, Sheet, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { errorMessage } from '@/lib/api/client';
import { toast } from '@/lib/toast';
import { haptics } from '@/lib/haptics';
import { AttachmentError, pickDocumentAttachment, pickImageAttachment } from '../attachments';
import type { Attachment } from '../useChatSession';

export interface ComposerProps {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
  disabledReason?: string;
  attachments: Attachment[];
  onAttachmentsChange: (a: Attachment[]) => void;
  onMic?: () => void;
  listening?: boolean;
  placeholder?: string;
}

export function Composer(p: ComposerProps) {
  const { colors, radius, typography } = useTheme();
  const [sheet, setSheet] = useState(false);
  const [uploading, setUploading] = useState(false);

  const attach = async (kind: 'image' | 'document') => {
    setSheet(false);
    if (p.attachments.length >= 4) {
      toast.info('Up to 4 attachments per message.');
      return;
    }
    setUploading(true);
    try {
      const a = kind === 'image' ? await pickImageAttachment() : await pickDocumentAttachment();
      if (a) {
        p.onAttachmentsChange([...p.attachments, a]);
        haptics.success();
      }
    } catch (e) {
      toast.error(e instanceof AttachmentError ? e.message : `Upload failed: ${errorMessage(e)}`);
    } finally {
      setUploading(false);
    }
  };

  const canSend = !p.disabled && !p.streaming && !uploading && p.value.trim().length > 0;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.bg, borderTopColor: colors.border }]}>
      {p.disabled && p.disabledReason ? (
        <View style={styles.reason}>
          <Icon name="information-circle-outline" size={14} color="textMuted" />
          <Text variant="small" color="textMuted" style={{ flex: 1 }}>
            {p.disabledReason}
          </Text>
        </View>
      ) : null}
      {p.attachments.length || uploading ? (
        <View style={styles.attachments}>
          {p.attachments.map((a) => (
            <View key={a.documentId} style={[styles.att, { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill }]}>
              <Icon name={a.kind === 'image' ? 'image-outline' : 'document-text-outline'} size={14} color="textMuted" />
              <Text variant="small" numberOfLines={1} style={{ maxWidth: 140 }}>
                {a.name}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${a.name}`} hitSlop={10} onPress={() => p.onAttachmentsChange(p.attachments.filter((x) => x.documentId !== a.documentId))}>
                <Icon name="close" size={14} color="textMuted" />
              </Pressable>
            </View>
          ))}
          {uploading ? (
            <View style={[styles.att, { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill }]}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text variant="small" color="textMuted">
                Uploading…
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={styles.row}>
        <IconButton icon="add-circle-outline" label="Attach a photo or file" disabled={p.disabled || p.streaming || uploading} onPress={() => setSheet(true)} />
        <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.xl }]}>
          <TextInput
            value={p.value}
            onChangeText={p.onChange}
            editable={!p.disabled}
            placeholder={p.listening ? 'Listening…' : (p.placeholder ?? 'Message Aura')}
            placeholderTextColor={colors.textSubtle}
            selectionColor={colors.primary}
            accessibilityLabel="Message"
            multiline
            maxLength={8000}
            style={[typography.body, { color: colors.text, maxHeight: 140, paddingVertical: 10 }]}
          />
        </View>
        {p.streaming ? (
          <IconButton icon="stop-circle" label="Stop the reply" variant="soft" onPress={p.onStop} />
        ) : p.value.trim() ? (
          <IconButton icon="arrow-up" label="Send" variant="filled" disabled={!canSend} onPress={p.onSend} />
        ) : (
          <IconButton icon={p.listening ? 'radio-button-on' : 'mic'} label={p.listening ? 'Stop listening' : 'Speak your message'} variant={p.listening ? 'filled' : 'soft'} disabled={p.disabled || !p.onMic} onPress={p.onMic} />
        )}
      </View>
      <Sheet visible={sheet} onClose={() => setSheet(false)} title="Attach">
        <ListItem icon="image-outline" title="Photo" subtitle="Ask about an image (receipt, screenshot, note)" onPress={() => void attach('image')} chevron />
        <ListItem icon="document-text-outline" title="File" subtitle="PDF, text, Markdown or CSV — up to 8 MB" onPress={() => void attach('document')} chevron />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 6, paddingTop: 6, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  inputWrap: { flex: 1, borderWidth: 1, paddingHorizontal: 14, minHeight: 48, justifyContent: 'center' },
  attachments: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 8, paddingBottom: 6 },
  att: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6 },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingBottom: 6 },
});
