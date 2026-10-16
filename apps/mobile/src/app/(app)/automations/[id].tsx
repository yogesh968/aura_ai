import { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Automation, AutomationRun, AutomationStep, AutomationTrigger } from '@aura/shared';
import {
  Button,
  Card,
  Chip,
  ChipGroup,
  DateTimeField,
  ErrorState,
  IconButton,
  LoadingState,
  Screen,
  ScreenHeader,
  SectionHeader,
  Segmented,
  SelectSheet,
  Text,
  TextField,
  ToggleRow,
} from '@/components/ui';
import { endpoints, type ToolCatalogItem } from '@/lib/api/endpoints';
import { ApiError, errorMessage } from '@/lib/api/client';
import { getEntity } from '@/lib/db/repo';
import { useOnline } from '@/lib/network';
import { toast } from '@/lib/toast';
import { DAY_LABELS, describeTrigger, RunStatusBadge, RunSteps } from '@/features/workspace/automations';
import { buildStepInput, schemaToFields, stepInputToRaw, TEMPLATE_TOKENS, type FormField } from '@/features/workspace/helpers';

const MAX_STEPS = 10;

type Raw = Record<string, string | boolean | undefined>;
interface DraftStep {
  key: string;
  tool: string;
  raw: Raw;
}

let keySeq = 0;
const newKey = () => `step-${++keySeq}`;

function toDate(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h ?? 8, m ?? 0, 0, 0);
  return d;
}
const toHHMM = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export default function AutomationEditorScreen() {
  const { id, fromRoutine } = useLocalSearchParams<{ id: string; fromRoutine?: string }>();
  const isNew = id === 'new';
  const existing = useQuery({ queryKey: ['automation', id], queryFn: () => endpoints.automations.get(id), enabled: !isNew });
  const catalog = useQuery({ queryKey: ['tool-catalog'], queryFn: () => endpoints.tools.catalog(), staleTime: 60 * 60_000 });

  if ((!isNew && existing.isLoading) || catalog.isLoading) {
    return (
      <Screen header={<ScreenHeader title="Automation" />}>
        <LoadingState />
      </Screen>
    );
  }
  const err = (!isNew ? existing.error : null) ?? catalog.error;
  if (err) {
    return (
      <Screen header={<ScreenHeader title="Automation" />}>
        <ErrorState
          error={err}
          onRetry={() => {
            void existing.refetch();
            void catalog.refetch();
          }}
        />
      </Screen>
    );
  }
  const tools = (catalog.data ?? []).filter((t) => t.automatable);
  return <Editor key={existing.data?.id ?? 'new'} initial={isNew ? null : (existing.data ?? null)} tools={tools} fromRoutine={isNew ? fromRoutine : undefined} />;
}

function Editor({ initial, tools, fromRoutine }: { initial: Automation | null; tools: ToolCatalogItem[]; fromRoutine?: string }) {
  const router = useRouter();
  const online = useOnline();
  const qc = useQueryClient();
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [triggerType, setTriggerType] = useState<AutomationTrigger['type']>(initial?.trigger.type ?? 'daily');
  const [time, setTime] = useState(initial && initial.trigger.type !== 'manual' ? initial.trigger.time : '08:00');
  const [days, setDays] = useState<number[]>(initial?.trigger.type === 'weekly' ? initial.trigger.days : [1, 2, 3, 4, 5]);
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [maxRetries, setMaxRetries] = useState(String(initial?.maxRetries ?? 1));
  const [steps, setSteps] = useState<DraftStep[]>(() => (initial?.steps ?? []).map((s) => ({ key: newKey(), tool: s.tool, raw: stepInputToRaw(s.input) })));
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [lastRun, setLastRun] = useState<AutomationRun | null>(null);

  // Run now executes the saved version on the server, so it's only offered when the form has no unsaved edits.
  const formSig = JSON.stringify({ name, description, triggerType, time, days: [...days].sort(), enabled, maxRetries, steps: steps.map((s) => [s.tool, s.raw]) });
  const [savedSig, setSavedSig] = useState(formSig);
  const dirty = formSig !== savedSig;
  const retriesNum = Number(maxRetries);
  const retriesInvalid = !(maxRetries.trim() !== '' && Number.isInteger(retriesNum) && retriesNum >= 0 && retriesNum <= 3);

  const toolByName = useMemo(() => new Map(tools.map((t) => [t.name, t])), [tools]);
  const fieldsFor = (tool: string): FormField[] => schemaToFields(toolByName.get(tool)?.inputSchema);

  // Prefill from a routine: a notification at the routine's time listing its steps.
  useEffect(() => {
    if (!fromRoutine) return;
    void getEntity('routine', fromRoutine).then((r) => {
      if (!r) return;
      setName(`${r.name} routine`);
      if (r.time) setTime(r.time);
      if (r.days.length && r.days.length < 7) {
        setTriggerType('weekly');
        setDays(r.days);
      } else setTriggerType('daily');
      setSteps([{ key: newKey(), tool: 'notify', raw: { title: `${r.name} time`, body: r.steps.slice(0, 6).join(' · ') || 'Time for your routine' } }]);
    });
  }, [fromRoutine]);

  const trigger: AutomationTrigger = triggerType === 'manual' ? { type: 'manual' } : triggerType === 'daily' ? { type: 'daily', time } : { type: 'weekly', time, days: [...days].sort() };

  const buildPayload = () => {
    const stepErrors: Record<string, Record<string, string>> = {};
    const built: AutomationStep[] = [];
    for (const s of steps) {
      const { input, errors: e } = buildStepInput(fieldsFor(s.tool), s.raw);
      if (Object.keys(e).length) stepErrors[s.key] = e;
      built.push({ tool: s.tool, input, label: toolByName.get(s.tool)?.label });
    }
    setErrors(stepErrors);
    if (!name.trim()) return { error: 'Give the automation a name' };
    if (steps.length === 0) return { error: 'Add at least one step' };
    if (triggerType === 'weekly' && days.length === 0) return { error: 'Pick at least one day' };
    if (Object.keys(stepErrors).length) return { error: 'Fix the highlighted step fields' };
    if (retriesInvalid) return { error: 'Retries must be a whole number from 0 to 3' };
    return {
      payload: {
        name: name.trim(),
        description: description.trim() || undefined,
        trigger,
        steps: built,
        enabled,
        maxRetries: retriesNum,
      },
    };
  };

  const save = useMutation({
    mutationFn: async (_sig: string) => {
      const { payload, error } = buildPayload();
      if (!payload) throw new Error(error);
      return initial ? endpoints.automations.update(initial.id, payload) : endpoints.automations.create(payload);
    },
    onMutate: () => setFormError(null),
    onSuccess: (a, sig) => {
      setSavedSig(sig);
      void qc.invalidateQueries({ queryKey: ['automations'] });
      void qc.invalidateQueries({ queryKey: ['automation', a.id] });
      void qc.invalidateQueries({ queryKey: ['automation-suggestions'] });
      toast.success(initial ? 'Automation saved' : `Created “${a.name}”`);
      if (!initial) router.replace(`/automations/${a.id}`);
    },
    onError: (e) => setFormError(e instanceof ApiError ? e.message : errorMessage(e)),
  });

  const run = useMutation({
    mutationFn: () => endpoints.automations.run(initial!.id),
    onSuccess: (r) => {
      setLastRun(r);
      void qc.invalidateQueries({ queryKey: ['automation-runs'] });
      void qc.invalidateQueries({ queryKey: ['automations'] });
    },
    onError: (e) => toast.error(errorMessage(e, 'Run failed')),
  });

  const remove = () =>
    Alert.alert('Delete automation?', 'Its schedule stops immediately. Run history is removed too.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await endpoints.automations.remove(initial!.id);
            void qc.invalidateQueries({ queryKey: ['automations'] });
            toast.success('Automation deleted');
            router.back();
          } catch (e) {
            toast.error(errorMessage(e, 'Could not delete'));
          }
        },
      },
    ]);

  const updateStep = (key: string, field: string, value: string | boolean) =>
    setSteps((list) => list.map((s) => (s.key === key ? { ...s, raw: { ...s.raw, [field]: value } } : s)));
  const moveStep = (index: number, delta: number) =>
    setSteps((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item!);
      return next;
    });

  return (
    <Screen
      header={
        <ScreenHeader
          title={initial ? 'Edit automation' : 'New automation'}
          subtitle={describeTrigger(trigger)}
          right={initial ? <IconButton icon="trash-outline" label="Delete automation" onPress={remove} disabled={!online} /> : null}
        />
      }
      footer={
        <View style={{ paddingHorizontal: 20, paddingVertical: 12, gap: 8 }}>
          {formError ? (
            <Text variant="small" color="danger" accessibilityLiveRegion="polite">
              {formError}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {initial ? <Button title="Run now" icon="play" variant="secondary" loading={run.isPending} disabled={!online || save.isPending || dirty} onPress={() => run.mutate()} style={{ flex: 1 }} /> : null}
            <Button title="Save" icon="checkmark" loading={save.isPending} disabled={!online} onPress={() => save.mutate(formSig)} style={{ flex: 1 }} />
          </View>
          {!online ? (
            <Text variant="small" color="textMuted" align="center">
              Automations are stored on the server — connect to save.
            </Text>
          ) : initial && dirty ? (
            <Text variant="small" color="textMuted" align="center">
              Save your changes to run this version.
            </Text>
          ) : null}
        </View>
      }
    >
      <View style={{ gap: 12 }}>
        <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Evening wind-down" maxLength={100} />
        <TextField label="Description (optional)" value={description} onChangeText={setDescription} maxLength={500} />
      </View>

      <SectionHeader title="When" />
      <Segmented
        options={[
          { value: 'daily', label: 'Daily' },
          { value: 'weekly', label: 'Weekly' },
          { value: 'manual', label: 'Manual' },
        ]}
        value={triggerType}
        onChange={setTriggerType}
      />
      {triggerType !== 'manual' ? (
        <View style={{ gap: 12, marginTop: 12 }}>
          <DateTimeField label="Time" mode="time" icon="time-outline" value={toDate(time)} clearable={false} onChange={(d) => d && setTime(toHHMM(d))} />
          {triggerType === 'weekly' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {DAY_LABELS.map((label, d) => (
                <Chip key={label} label={label} selected={days.includes(d)} onPress={() => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))} />
              ))}
            </View>
          ) : null}
          <Text variant="small" color="textSubtle">
            Times use the timezone in your assistant settings.
          </Text>
        </View>
      ) : null}
      <View style={{ marginTop: 8 }}>
        <ToggleRow label="Enabled" description={triggerType === 'manual' ? 'Manual automations only run when you tap Run now' : 'Turn off to pause the schedule'} value={enabled} onChange={setEnabled} />
      </View>

      <SectionHeader title={`Steps (${steps.length}/${MAX_STEPS})`} />
      <Text variant="small" color="textMuted" style={{ marginBottom: 10 }}>
        Steps run in order and stop at the first failure. Date fields accept tokens: {TEMPLATE_TOKENS.join('  ')}
      </Text>
      <View style={{ gap: 10 }}>
        {steps.map((step, index) => {
          const tool = toolByName.get(step.tool);
          const fields = fieldsFor(step.tool);
          const stepErrors = errors[step.key] ?? {};
          return (
            <Card key={step.key}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text variant="bodyStrong" style={{ flex: 1 }}>
                  {index + 1}. {tool?.label ?? step.tool}
                </Text>
                <IconButton icon="arrow-up" label="Move step up" size={18} disabled={index === 0} onPress={() => moveStep(index, -1)} />
                <IconButton icon="arrow-down" label="Move step down" size={18} disabled={index === steps.length - 1} onPress={() => moveStep(index, 1)} />
                <IconButton icon="close" label="Remove step" size={18} onPress={() => setSteps((l) => l.filter((s) => s.key !== step.key))} />
              </View>
              {!tool ? (
                <Text variant="small" color="danger">
                  This action is no longer available for automations. Remove it.
                </Text>
              ) : (
                <Text variant="small" color="textMuted" style={{ marginBottom: 8 }}>
                  {tool.description}
                </Text>
              )}
              <View style={{ gap: 10 }}>
                {fields.map((f) => {
                  const value = step.raw[f.key];
                  const label = `${f.label}${f.required ? '' : ' (optional)'}`;
                  if (f.kind === 'boolean') {
                    return <ToggleRow key={f.key} label={f.label} value={value === true} onChange={(v) => updateStep(step.key, f.key, v)} />;
                  }
                  if (f.kind === 'enum' && f.options) {
                    return (
                      <View key={f.key} style={{ gap: 6 }}>
                        <Text variant="small" color="textMuted">
                          {label}
                        </Text>
                        <ChipGroup
                          options={[...(f.required ? [] : [{ value: '', label: 'Default' }]), ...f.options.map((o) => ({ value: o, label: o }))]}
                          value={typeof value === 'string' ? value : ''}
                          onChange={(v) => updateStep(step.key, f.key, v)}
                        />
                        {stepErrors[f.key] ? (
                          <Text variant="small" color="danger">
                            {stepErrors[f.key]}
                          </Text>
                        ) : null}
                      </View>
                    );
                  }
                  if (f.kind === 'unsupported') return null;
                  return (
                    <TextField
                      key={f.key}
                      label={label}
                      value={typeof value === 'string' ? value : ''}
                      onChangeText={(v) => updateStep(step.key, f.key, v)}
                      multiline={f.kind === 'text'}
                      keyboardType={f.kind === 'number' || f.kind === 'integer' ? 'numeric' : 'default'}
                      autoCapitalize={f.kind === 'datetime' || f.kind === 'date' ? 'none' : 'sentences'}
                      placeholder={f.kind === 'datetime' ? '{{today@18:00}}' : f.kind === 'date' ? '{{today}} or 2026-12-31' : f.kind === 'stringList' ? 'comma, separated' : undefined}
                      error={stepErrors[f.key]}
                      helper={f.description}
                    />
                  );
                })}
                {fields.length === 0 && tool ? (
                  <Text variant="small" color="textSubtle">
                    No settings needed.
                  </Text>
                ) : null}
              </View>
            </Card>
          );
        })}
        <Button title="Add step" icon="add" variant="soft" disabled={steps.length >= MAX_STEPS} onPress={() => setPicking(true)} />
      </View>

      <SectionHeader title="Reliability" />
      <TextField label="Retries after a failed scheduled run (0–3)" value={maxRetries} onChangeText={setMaxRetries} keyboardType="number-pad" maxLength={1} helper="Retries wait 1, 5 and 15 minutes." error={retriesInvalid ? 'Enter a whole number from 0 to 3' : null} />

      {lastRun ? (
        <>
          <SectionHeader title="Last test run" action="History" onAction={() => router.push(`/automations/history?automationId=${initial?.id ?? ''}`)} />
          <Card>
            <RunStatusBadge status={lastRun.status} />
            <RunSteps run={lastRun} />
          </Card>
        </>
      ) : initial ? (
        <Button title="View run history" variant="ghost" icon="time-outline" onPress={() => router.push(`/automations/history?automationId=${initial.id}`)} style={{ marginTop: 16 }} />
      ) : null}

      <SelectSheet
        visible={picking}
        onClose={() => setPicking(false)}
        title="Add a step"
        options={tools.map((t) => ({ value: t.name, label: t.label, description: t.description }))}
        onSelect={(tool) => setSteps((l) => [...l, { key: newKey(), tool, raw: {} }])}
      />
    </Screen>
  );
}
