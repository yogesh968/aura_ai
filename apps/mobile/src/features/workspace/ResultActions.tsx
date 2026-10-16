import { useState } from 'react';
import { Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Button } from '@/components/ui';
import { createEntity } from '@/lib/db/repo';
import { speak, stopSpeaking } from '@/lib/voice/speech';
import { useSettingsStore } from '@/lib/settings';
import { toast } from '@/lib/toast';

/** Copy / share / speak / save-as-note actions for AI tool output. */
export function ResultActions({ text, noteTitle, speakable = true, shareable = true }: { text: string; noteTitle?: string; speakable?: boolean; shareable?: boolean }) {
  const prefs = useSettingsStore((s) => s.preferences);
  const [speaking, setSpeaking] = useState(false);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
      <Button title="Copy" size="sm" variant="secondary" icon="copy-outline" onPress={() => void Clipboard.setStringAsync(text).then(() => toast.success('Copied'))} />
      {shareable ? <Button title="Share" size="sm" variant="secondary" icon="share-outline" onPress={() => void Share.share({ message: text })} /> : null}
      {speakable ? (
        <Button
          title={speaking ? 'Stop' : 'Listen'}
          size="sm"
          variant="secondary"
          icon={speaking ? 'stop-circle-outline' : 'volume-high-outline'}
          onPress={() => {
            if (speaking) {
              void stopSpeaking();
              setSpeaking(false);
              return;
            }
            setSpeaking(true);
            speak(text, {
              language: prefs.language,
              rate: prefs.voice.rate,
              pitch: prefs.voice.pitch,
              voice: prefs.voice.voiceId,
              onDone: () => setSpeaking(false),
              onError: () => setSpeaking(false),
            });
          }}
        />
      ) : null}
      {noteTitle ? (
        <Button
          title="Save as note"
          size="sm"
          variant="secondary"
          icon="document-text-outline"
          onPress={() =>
            void createEntity('note', { title: noteTitle.slice(0, 200), content: text, kind: 'note', tags: ['aura'] })
              .then(() => toast.success('Saved to Notes'))
              .catch(() => toast.error('Could not save the note'))
          }
        />
      ) : null}
    </View>
  );
}
