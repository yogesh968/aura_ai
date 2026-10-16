import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { fromMinor, minorDigits } from '@aura/shared';
import { SelectSheet, Text, TextField } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

export const COMMON_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'JPY', 'AUD', 'CAD'];

export function minorToInput(amountMinor: number, currency: string) {
  return fromMinor(amountMinor, currency).toFixed(minorDigits(currency));
}

/** Amount input with an attached currency picker. */
export function CurrencyAmountField({
  label = 'Amount',
  value,
  onChange,
  currency,
  onCurrencyChange,
  error,
  autoFocus,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  currency: string;
  onCurrencyChange?: (c: string) => void;
  error?: string | null;
  autoFocus?: boolean;
}) {
  const { colors, radius } = useTheme();
  const [open, setOpen] = useState(false);
  const options = [...new Set([currency, ...COMMON_CURRENCIES])].map((c) => ({ value: c, label: c }));
  return (
    <View>
      <TextField
        label={label}
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder={minorDigits(currency) ? '0.00' : '0'}
        error={error}
        autoFocus={autoFocus}
        style={{ fontSize: 22, fontWeight: '700' }}
        right={
          onCurrencyChange ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Currency ${currency}. Change`}
              onPress={() => setOpen(true)}
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt }}
            >
              <Text variant="caption" weight="700">
                {currency} ▾
              </Text>
            </Pressable>
          ) : (
            <Text variant="caption" color="textMuted">
              {currency}
            </Text>
          )
        }
      />
      {onCurrencyChange ? <SelectSheet visible={open} onClose={() => setOpen(false)} title="Currency" options={options} value={currency} onSelect={onCurrencyChange} /> : null}
    </View>
  );
}
