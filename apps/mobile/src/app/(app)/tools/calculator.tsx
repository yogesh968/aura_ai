import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { CalcError, evaluateExpression, formatNumber } from '@aura/shared';
import { Button, Card, IconButton, Screen, ScreenHeader, SectionHeader, Text, TextField } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';

const KEYS = [
  ['C', '(', ')', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '-'],
  ['1', '2', '3', '+'],
  ['%', '0', '.', '^'],
];

export default function CalculatorScreen() {
  const { colors, radius } = useTheme();
  const [expr, setExpr] = useState('');
  const [history, setHistory] = useState<{ expr: string; result: string }[]>([]);

  const preview = useMemo(() => {
    if (!expr.trim()) return { text: '', error: false };
    try {
      return { text: formatNumber(evaluateExpression(expr)), error: false };
    } catch (e) {
      return { text: e instanceof CalcError ? e.message : 'Invalid expression', error: true };
    }
  }, [expr]);

  const press = (key: string) => {
    haptics.tap();
    if (key === 'C') setExpr('');
    else setExpr((e) => e + key);
  };

  const equals = () => {
    if (!expr.trim()) return;
    try {
      const result = formatNumber(evaluateExpression(expr));
      setHistory((h) => [{ expr, result }, ...h].slice(0, 20));
      setExpr(result.replace(/,/g, ''));
    } catch (e) {
      haptics.error();
      toast.error(e instanceof CalcError ? e.message : 'Invalid expression');
    }
  };

  return (
    <Screen header={<ScreenHeader title="Calculator" subtitle="Works offline" />}>
      <TextField
        value={expr}
        onChangeText={setExpr}
        placeholder="e.g. 15% of 2400 or sqrt(2)*3"
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={equals}
        returnKeyType="done"
        accessibilityLabel="Expression"
        right={expr ? <IconButton icon="backspace-outline" label="Delete last character" onPress={() => setExpr((e) => e.slice(0, -1))} /> : null}
      />
      <Text
        variant="display"
        color={preview.error ? 'textSubtle' : 'text'}
        align="right"
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ marginVertical: 16, fontSize: preview.error ? 16 : 32 }}
        accessibilityLiveRegion="polite"
        accessibilityLabel={preview.text ? `Result ${preview.text}` : 'No result'}
      >
        {preview.text ? (preview.error ? preview.text : `= ${preview.text}`) : ' '}
      </Text>
      <View style={{ gap: 8 }}>
        {KEYS.map((row) => (
          <View key={row.join('')} style={{ flexDirection: 'row', gap: 8 }}>
            {row.map((k) => {
              const op = '÷×-+^%()'.includes(k);
              return (
                <Pressable
                  key={k}
                  accessibilityRole="button"
                  accessibilityLabel={k === 'C' ? 'Clear' : k === '÷' ? 'divide' : k === '×' ? 'multiply' : k === '^' ? 'power' : k}
                  onPress={() => press(k)}
                  style={({ pressed }) => [
                    styles.key,
                    { borderRadius: radius.lg, backgroundColor: pressed ? colors.surfacePressed : k === 'C' ? colors.dangerSoft : op ? colors.primarySoft : colors.surface, borderColor: colors.border },
                  ]}
                >
                  <Text variant="heading" color={k === 'C' ? 'danger' : op ? 'primary' : 'text'}>
                    {k}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
        <Button title="=" onPress={equals} size="lg" fullWidth />
      </View>
      <Text variant="small" color="textSubtle" style={{ marginTop: 10 }}>
        Also: sqrt, cbrt, abs, sin, cos, tan, log, ln, exp, round, floor, ceil, min, max, pi, e, mod, and “x% of y”.
      </Text>
      {history.length ? (
        <>
          <SectionHeader title="History" action="Clear" onAction={() => setHistory([])} />
          <Card padded={false}>
            {history.map((h, i) => (
              <Pressable
                key={`${h.expr}-${i}`}
                accessibilityRole="button"
                accessibilityLabel={`${h.expr} equals ${h.result}. Tap to reuse, long press to copy`}
                onPress={() => setExpr(h.expr)}
                onLongPress={() => void Clipboard.setStringAsync(h.result).then(() => toast.success('Result copied'))}
                style={({ pressed }) => [styles.historyRow, { backgroundColor: pressed ? colors.surfacePressed : 'transparent', borderBottomColor: colors.border }]}
              >
                <Text variant="caption" color="textMuted" numberOfLines={1} style={{ flex: 1 }}>
                  {h.expr}
                </Text>
                <Text variant="bodyStrong">{h.result}</Text>
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  key: { flex: 1, height: 58, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth },
});
