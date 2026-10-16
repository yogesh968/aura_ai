import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { convertUnits, formatNumber, UnitError } from '@aura/shared';
import { Card, ChipGroup, IconButton, Screen, ScreenHeader, SelectRow, SelectSheet, Text, TextField } from '@/components/ui';

type Dimension = 'length' | 'mass' | 'volume' | 'temperature' | 'speed' | 'area' | 'time' | 'data';

/** Units per dimension (keys accepted by convertUnits). */
const UNITS: Record<Dimension, { key: string; label: string }[]> = {
  length: [
    { key: 'mm', label: 'Millimetres' },
    { key: 'cm', label: 'Centimetres' },
    { key: 'm', label: 'Metres' },
    { key: 'km', label: 'Kilometres' },
    { key: 'in', label: 'Inches' },
    { key: 'ft', label: 'Feet' },
    { key: 'yd', label: 'Yards' },
    { key: 'mi', label: 'Miles' },
    { key: 'nmi', label: 'Nautical miles' },
  ],
  mass: [
    { key: 'mg', label: 'Milligrams' },
    { key: 'g', label: 'Grams' },
    { key: 'kg', label: 'Kilograms' },
    { key: 't', label: 'Tonnes' },
    { key: 'oz', label: 'Ounces' },
    { key: 'lb', label: 'Pounds' },
    { key: 'st', label: 'Stone' },
  ],
  volume: [
    { key: 'ml', label: 'Millilitres' },
    { key: 'l', label: 'Litres' },
    { key: 'tsp', label: 'Teaspoons' },
    { key: 'tbsp', label: 'Tablespoons' },
    { key: 'cup', label: 'Cups' },
    { key: 'floz', label: 'US fluid ounces' },
    { key: 'pt', label: 'US pints' },
    { key: 'qt', label: 'US quarts' },
    { key: 'gal', label: 'US gallons' },
  ],
  temperature: [
    { key: 'c', label: 'Celsius' },
    { key: 'f', label: 'Fahrenheit' },
    { key: 'k', label: 'Kelvin' },
  ],
  speed: [
    { key: 'km/h', label: 'Km per hour' },
    { key: 'm/s', label: 'Metres per second' },
    { key: 'mph', label: 'Miles per hour' },
    { key: 'kn', label: 'Knots' },
  ],
  area: [
    { key: 'm2', label: 'Square metres' },
    { key: 'km2', label: 'Square kilometres' },
    { key: 'ft2', label: 'Square feet' },
    { key: 'acre', label: 'Acres' },
    { key: 'ha', label: 'Hectares' },
  ],
  time: [
    { key: 's', label: 'Seconds' },
    { key: 'min', label: 'Minutes' },
    { key: 'h', label: 'Hours' },
    { key: 'day', label: 'Days' },
    { key: 'week', label: 'Weeks' },
  ],
  data: [
    { key: 'b', label: 'Bytes' },
    { key: 'kb', label: 'Kilobytes' },
    { key: 'mb', label: 'Megabytes' },
    { key: 'gb', label: 'Gigabytes' },
    { key: 'tb', label: 'Terabytes' },
  ],
};

const DIMENSIONS: { value: Dimension; label: string }[] = [
  { value: 'length', label: 'Length' },
  { value: 'mass', label: 'Weight' },
  { value: 'temperature', label: 'Temperature' },
  { value: 'volume', label: 'Volume' },
  { value: 'speed', label: 'Speed' },
  { value: 'area', label: 'Area' },
  { value: 'time', label: 'Time' },
  { value: 'data', label: 'Data' },
];

const DEFAULTS: Record<Dimension, [string, string]> = {
  length: ['km', 'mi'],
  mass: ['kg', 'lb'],
  volume: ['l', 'cup'],
  temperature: ['c', 'f'],
  speed: ['km/h', 'mph'],
  area: ['m2', 'ft2'],
  time: ['h', 'min'],
  data: ['gb', 'mb'],
};

export default function ConverterScreen() {
  const [dimension, setDimension] = useState<Dimension>('length');
  const [from, setFrom] = useState('km');
  const [to, setTo] = useState('mi');
  const [value, setValue] = useState('1');
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);

  const units = UNITS[dimension];
  const label = (k: string) => units.find((u) => u.key === k)?.label ?? k;

  const result = useMemo(() => {
    const n = Number(value.replace(/,/g, ''));
    if (!value.trim() || !Number.isFinite(n)) return { text: 'Enter a number', ok: false };
    try {
      return { text: formatNumber(convertUnits(n, from, to).value), ok: true };
    } catch (e) {
      return { text: e instanceof UnitError ? e.message : 'Cannot convert', ok: false };
    }
  }, [value, from, to]);

  const changeDimension = (d: Dimension) => {
    setDimension(d);
    setFrom(DEFAULTS[d][0]);
    setTo(DEFAULTS[d][1]);
  };

  return (
    <Screen header={<ScreenHeader title="Unit converter" subtitle="Works offline" />}>
      <ChipGroup options={DIMENSIONS} value={dimension} onChange={changeDimension} />
      <View style={{ gap: 12, marginTop: 16 }}>
        <TextField label="Value" value={value} onChangeText={setValue} keyboardType="decimal-pad" accessibilityLabel="Value to convert" />
        <SelectRow label="From" value={label(from)} onPress={() => setPicking('from')} />
        <View style={{ alignItems: 'center' }}>
          <IconButton
            icon="swap-vertical"
            label="Swap units"
            variant="soft"
            onPress={() => {
              setFrom(to);
              setTo(from);
            }}
          />
        </View>
        <SelectRow label="To" value={label(to)} onPress={() => setPicking('to')} />
      </View>
      <Card tone="primary" style={{ marginTop: 20 }}>
        <Text variant="small" color="textMuted">
          {value || '0'} {label(from)} =
        </Text>
        <Text variant={result.ok ? 'display' : 'body'} color={result.ok ? 'text' : 'textMuted'} selectable accessibilityLiveRegion="polite" numberOfLines={2} adjustsFontSizeToFit>
          {result.text}
        </Text>
        {result.ok ? (
          <Text variant="caption" color="textMuted">
            {label(to)}
          </Text>
        ) : null}
      </Card>
      <SelectSheet
        visible={picking !== null}
        onClose={() => setPicking(null)}
        title={picking === 'from' ? 'Convert from' : 'Convert to'}
        options={units.map((u) => ({ value: u.key, label: u.label, description: u.key }))}
        value={picking === 'from' ? from : to}
        onSelect={(v) => (picking === 'from' ? setFrom(v) : setTo(v))}
      />
    </Screen>
  );
}
