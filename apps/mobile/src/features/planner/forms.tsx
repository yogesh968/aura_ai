import { useState, type ReactNode } from 'react';
import { Alert, View } from 'react-native';
import { recurrenceLabel, type Recurrence } from '@aura/shared';
import { ChipGroup, IconButton, SelectRow, SelectSheet, Text, type SelectOption } from '@/components/ui';
import { ValidationError } from '@/lib/db/repo';
import { errorMessage } from '@/lib/api/client';
import { toast } from '@/lib/toast';

export const RECURRENCE_OPTIONS: SelectOption<Recurrence>[] = (['none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly'] as const).map((r) => ({
  value: r,
  label: recurrenceLabel(r),
}));

export const PRIORITY_OPTIONS = [
  { value: 'low' as const, label: 'Low' },
  { value: 'medium' as const, label: 'Medium' },
  { value: 'high' as const, label: 'High' },
  { value: 'urgent' as const, label: 'Urgent' },
];

export function FormSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 12, marginTop: 20 }}>
      {title ? (
        <Text variant="overline" color="textMuted">
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

/** Generic "label + current value" row that opens a SelectSheet. */
export function SelectField<T extends string>({ label, value, options, onChange, icon }: { label: string; value: T; options: SelectOption<T>[]; onChange: (v: T) => void; icon?: Parameters<typeof SelectRow>[0]['icon'] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <SelectRow label={label} value={options.find((o) => o.value === value)?.label ?? null} onPress={() => setOpen(true)} icon={icon} />
      <SelectSheet visible={open} onClose={() => setOpen(false)} title={label} options={options} value={value} onSelect={onChange} />
    </>
  );
}

export function RecurrenceField({ value, onChange }: { value: Recurrence; onChange: (r: Recurrence) => void }) {
  return <SelectField label="Repeat" value={value} options={RECURRENCE_OPTIONS} onChange={onChange} icon="repeat-outline" />;
}

export function PriorityField<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return <ChipGroup options={options} value={value} onChange={onChange} />;
}

/** Map a save error to field errors (ValidationError) or a toast. */
export function handleSaveError(e: unknown, setErrors: (f: Record<string, string>) => void) {
  if (e instanceof ValidationError) {
    setErrors(e.fields);
    toast.error('Please fix the highlighted fields');
  } else {
    toast.error(errorMessage(e, "Couldn't save"));
  }
}

export function DeleteButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  return (
    <IconButton
      icon="trash-outline"
      label={`Delete ${label}`}
      onPress={() =>
        Alert.alert(`Delete ${label}?`, 'You can undo right after deleting.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: onConfirm },
        ])
      }
    />
  );
}

export const parseDateParam = (v: string | string[] | undefined): Date | null => {
  const s = Array.isArray(v) ? v[0] : v;
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const stringParam = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v) || undefined;
