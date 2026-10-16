/** Offline unit conversion. Each unit maps to a factor relative to its dimension's base unit. */

type Dimension = 'length' | 'mass' | 'volume' | 'temperature' | 'speed' | 'area' | 'time' | 'data';

interface UnitDef {
  dimension: Dimension;
  factor: number; // multiply to get base unit (temperature handled separately)
  label: string;
}

const U = (dimension: Dimension, factor: number, label: string): UnitDef => ({ dimension, factor, label });

const UNITS: Record<string, UnitDef> = {
  // length (base: metre)
  mm: U('length', 0.001, 'millimetres'),
  cm: U('length', 0.01, 'centimetres'),
  m: U('length', 1, 'metres'),
  km: U('length', 1000, 'kilometres'),
  in: U('length', 0.0254, 'inches'),
  ft: U('length', 0.3048, 'feet'),
  yd: U('length', 0.9144, 'yards'),
  mi: U('length', 1609.344, 'miles'),
  nmi: U('length', 1852, 'nautical miles'),
  // mass (base: kilogram)
  mg: U('mass', 1e-6, 'milligrams'),
  g: U('mass', 0.001, 'grams'),
  kg: U('mass', 1, 'kilograms'),
  t: U('mass', 1000, 'tonnes'),
  oz: U('mass', 0.028349523125, 'ounces'),
  lb: U('mass', 0.45359237, 'pounds'),
  st: U('mass', 6.35029318, 'stone'),
  // volume (base: litre)
  ml: U('volume', 0.001, 'millilitres'),
  l: U('volume', 1, 'litres'),
  tsp: U('volume', 0.00492892, 'teaspoons'),
  tbsp: U('volume', 0.0147868, 'tablespoons'),
  cup: U('volume', 0.24, 'cups'),
  floz: U('volume', 0.0295735, 'US fluid ounces'),
  pt: U('volume', 0.473176, 'US pints'),
  qt: U('volume', 0.946353, 'US quarts'),
  gal: U('volume', 3.78541, 'US gallons'),
  // temperature (special)
  c: U('temperature', 1, '°C'),
  f: U('temperature', 1, '°F'),
  k: U('temperature', 1, 'K'),
  // speed (base: m/s)
  'm/s': U('speed', 1, 'metres per second'),
  'km/h': U('speed', 1 / 3.6, 'kilometres per hour'),
  mph: U('speed', 0.44704, 'miles per hour'),
  kn: U('speed', 0.514444, 'knots'),
  // area (base: m²)
  m2: U('area', 1, 'square metres'),
  km2: U('area', 1e6, 'square kilometres'),
  ft2: U('area', 0.09290304, 'square feet'),
  acre: U('area', 4046.8564224, 'acres'),
  ha: U('area', 10000, 'hectares'),
  // time (base: second)
  s: U('time', 1, 'seconds'),
  min: U('time', 60, 'minutes'),
  h: U('time', 3600, 'hours'),
  day: U('time', 86400, 'days'),
  week: U('time', 604800, 'weeks'),
  // data (base: byte)
  b: U('data', 1, 'bytes'),
  kb: U('data', 1024, 'kilobytes'),
  mb: U('data', 1024 ** 2, 'megabytes'),
  gb: U('data', 1024 ** 3, 'gigabytes'),
  tb: U('data', 1024 ** 4, 'terabytes'),
};

const ALIASES: Record<string, string> = {
  millimeter: 'mm', millimetre: 'mm', centimeter: 'cm', centimetre: 'cm', meter: 'm', metre: 'm',
  kilometer: 'km', kilometre: 'km', inch: 'in', inches: 'in', foot: 'ft', feet: 'ft', yard: 'yd',
  mile: 'mi', miles: 'mi', gram: 'g', grams: 'g', kilogram: 'kg', kilo: 'kg', kgs: 'kg', tonne: 't',
  ounce: 'oz', pound: 'lb', pounds: 'lb', lbs: 'lb', stone: 'st', milliliter: 'ml', millilitre: 'ml',
  liter: 'l', litre: 'l', liters: 'l', litres: 'l', teaspoon: 'tsp', tablespoon: 'tbsp', cups: 'cup',
  'fl oz': 'floz', pint: 'pt', quart: 'qt', gallon: 'gal', gallons: 'gal', celsius: 'c', '°c': 'c',
  fahrenheit: 'f', '°f': 'f', kelvin: 'k', kmh: 'km/h', kph: 'km/h', 'mi/h': 'mph', knot: 'kn', knots: 'kn',
  sqm: 'm2', 'm²': 'm2', 'km²': 'km2', sqft: 'ft2', 'ft²': 'ft2', acres: 'acre', hectare: 'ha',
  sec: 's', second: 's', seconds: 's', minute: 'min', minutes: 'min', mins: 'min', hr: 'h', hour: 'h',
  hours: 'h', hrs: 'h', days: 'day', weeks: 'week', byte: 'b', bytes: 'b', kilobyte: 'kb', megabyte: 'mb',
  gigabyte: 'gb', terabyte: 'tb',
};

export class UnitError extends Error {}

function resolve(unit: string): [string, UnitDef] {
  const key = unit.trim().toLowerCase();
  const canonical = UNITS[key] ? key : ALIASES[key] ?? ALIASES[key.replace(/s$/, '')];
  const def = canonical ? UNITS[canonical] : undefined;
  if (!canonical || !def) throw new UnitError(`Unknown unit "${unit}"`);
  return [canonical, def];
}

function toKelvin(v: number, u: string) {
  return u === 'c' ? v + 273.15 : u === 'f' ? ((v - 32) * 5) / 9 + 273.15 : v;
}
function fromKelvin(v: number, u: string) {
  return u === 'c' ? v - 273.15 : u === 'f' ? ((v - 273.15) * 9) / 5 + 32 : v;
}

export function convertUnits(value: number, from: string, to: string): { value: number; from: string; to: string } {
  const [fk, fd] = resolve(from);
  const [tk, td] = resolve(to);
  if (fd.dimension !== td.dimension) {
    throw new UnitError(`Cannot convert ${fd.label} (${fd.dimension}) to ${td.label} (${td.dimension})`);
  }
  const result =
    fd.dimension === 'temperature' ? fromKelvin(toKelvin(value, fk), tk) : (value * fd.factor) / td.factor;
  return { value: Number(result.toPrecision(10)), from: fd.label, to: td.label };
}

export function supportedUnits(): string[] {
  return Object.keys(UNITS);
}
