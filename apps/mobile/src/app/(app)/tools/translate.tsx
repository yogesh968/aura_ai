import { useState } from 'react';
import { View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { Button, Card, ErrorState, IconButton, Screen, ScreenHeader, SelectRow, SelectSheet, Text, TextField } from '@/components/ui';
import { endpoints } from '@/lib/api/endpoints';
import { useOnline } from '@/lib/network';
import { ResultActions } from '@/features/workspace/ResultActions';

const LANGUAGES = [
  'English',
  'Hindi',
  'Hinglish (Hindi in Roman script)',
  'Marathi',
  'Bengali',
  'Tamil',
  'Telugu',
  'Gujarati',
  'Kannada',
  'Malayalam',
  'Punjabi',
  'Urdu',
  'Spanish',
  'French',
  'German',
  'Arabic',
  'Japanese',
  'Chinese (Simplified)',
];

export default function TranslateScreen() {
  const online = useOnline();
  const [text, setText] = useState('');
  const [target, setTarget] = useState('Hindi');
  const [picking, setPicking] = useState(false);
  // The request's own target travels with the result, so changing the picker never relabels it.
  const translate = useMutation({
    mutationFn: async (v: { text: string; target: string }) => ({ ...(await endpoints.ai.translate(v.text, v.target)), target: v.target }),
  });
  const run = () => translate.mutate({ text: text.trim(), target });

  return (
    <Screen header={<ScreenHeader title="Translate" subtitle="Powered by Aura AI" />}>
      <View style={{ gap: 12 }}>
        <TextField label="Text" value={text} onChangeText={setText} multiline placeholder="Type or paste text to translate" maxLength={5000} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ flex: 1 }}>
            <SelectRow label="To" value={target} onPress={() => setPicking(true)} icon="language-outline" />
          </View>
          {translate.data ? (
            <IconButton
              icon="swap-vertical"
              label="Use translation as new input"
              onPress={() => {
                setText(translate.data.translation);
                translate.reset();
              }}
            />
          ) : null}
        </View>
        <Button
          title="Translate"
          icon="sparkles-outline"
          loading={translate.isPending}
          disabled={!online || !text.trim()}
          onPress={run}
          fullWidth
        />
        {!online ? (
          <Text variant="small" color="textMuted" align="center">
            Translation needs an internet connection.
          </Text>
        ) : null}
      </View>
      {translate.error ? <ErrorState error={translate.error} onRetry={run} compact /> : null}
      {translate.data ? (
        <Card tone="primary" style={{ marginTop: 16 }}>
          <Text variant="small" color="textMuted">
            {translate.data.target}
          </Text>
          <Text variant="body" selectable style={{ marginTop: 6 }}>
            {translate.data.translation}
          </Text>
          <ResultActions text={translate.data.translation} />
        </Card>
      ) : null}
      <SelectSheet visible={picking} onClose={() => setPicking(false)} title="Translate to" options={LANGUAGES.map((l) => ({ value: l, label: l }))} value={target} onSelect={setTarget} />
    </Screen>
  );
}
