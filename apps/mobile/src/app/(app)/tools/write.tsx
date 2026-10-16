import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { Button, Card, ChipGroup, ErrorState, Screen, ScreenHeader, Text, TextField } from '@/components/ui';
import { endpoints } from '@/lib/api/endpoints';
import { loadDraft, saveDraft } from '@/lib/db/database';
import { useOnline } from '@/lib/network';
import { ResultActions } from '@/features/workspace/ResultActions';

type Kind = 'email' | 'message' | 'summary' | 'rewrite' | 'code' | 'general';

const KINDS: { value: Kind; label: string; hint: string; needsText: boolean }[] = [
  { value: 'email', label: 'Email', hint: 'e.g. Ask my landlord to fix the geyser by Friday, polite tone', needsText: false },
  { value: 'message', label: 'Message', hint: 'e.g. Tell Rohan I’ll be 15 minutes late', needsText: false },
  { value: 'summary', label: 'Summarize', hint: 'e.g. 5 bullet points, keep dates', needsText: true },
  { value: 'rewrite', label: 'Rewrite', hint: 'e.g. Make it more formal and shorter', needsText: true },
  { value: 'code', label: 'Code', hint: 'e.g. Explain this function / write a Python script that…', needsText: false },
  { value: 'general', label: 'Other', hint: 'Describe what you need', needsText: false },
];

const DRAFT = 'tool:write';

export default function WriteScreen() {
  const online = useOnline();
  const [kind, setKind] = useState<Kind>('email');
  const [instructions, setInstructions] = useState('');
  const [material, setMaterial] = useState('');
  const write = useMutation({
    mutationFn: () => endpoints.ai.write({ kind, instructions: instructions.trim(), text: material.trim() || undefined }),
  });
  const meta = KINDS.find((k) => k.value === kind)!;

  useEffect(() => {
    void loadDraft(DRAFT).then((raw) => {
      if (!raw) return;
      try {
        const d = JSON.parse(raw) as { instructions?: string; material?: string };
        setInstructions(d.instructions ?? '');
        setMaterial(d.material ?? '');
      } catch {
        /* ignore */
      }
    });
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void saveDraft(DRAFT, instructions || material ? JSON.stringify({ instructions, material }) : ''), 600);
    return () => clearTimeout(t);
  }, [instructions, material]);

  const canRun = online && instructions.trim().length > 0 && (!meta.needsText || material.trim().length > 0);

  return (
    <Screen header={<ScreenHeader title="Writing assistant" subtitle="Drafts you review before using" />}>
      <ChipGroup options={KINDS.map((k) => ({ value: k.value, label: k.label }))} value={kind} onChange={setKind} />
      <View style={{ gap: 12, marginTop: 16 }}>
        <TextField label="What do you need?" value={instructions} onChangeText={setInstructions} multiline placeholder={meta.hint} maxLength={4000} />
        <TextField
          label={meta.needsText ? 'Text to work on' : 'Text to work on (optional)'}
          value={material}
          onChangeText={setMaterial}
          multiline
          placeholder="Paste text here"
          maxLength={30000}
        />
        <Button title="Write it" icon="sparkles-outline" loading={write.isPending} disabled={!canRun} onPress={() => write.mutate()} fullWidth />
        {!online ? (
          <Text variant="small" color="textMuted" align="center">
            Needs an internet connection. Your text is kept as a draft.
          </Text>
        ) : null}
      </View>
      {write.error ? <ErrorState error={write.error} onRetry={() => write.mutate()} compact /> : null}
      {write.data ? (
        <Card style={{ marginTop: 16 }}>
          <Text variant="body" selectable>
            {write.data.text}
          </Text>
          <ResultActions text={write.data.text} noteTitle={`${meta.label}: ${instructions.trim().slice(0, 60)}`} speakable={kind !== 'code'} />
          <Text variant="small" color="textSubtle" style={{ marginTop: 10 }}>
            Aura never sends anything for you — copy or share the draft to your own app.
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}
