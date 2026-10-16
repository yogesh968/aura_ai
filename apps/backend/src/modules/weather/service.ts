import type { Weather } from '@aura/shared';
import { AppError } from '../../lib/errors';

type FetchFn = typeof fetch;

const WMO: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Freezing fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  56: 'Freezing drizzle',
  57: 'Freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Rain showers',
  81: 'Rain showers',
  82: 'Violent rain showers',
  85: 'Snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with heavy hail',
};

export const describeWeatherCode = (code: number) => WMO[code] ?? 'Unknown conditions';

/**
 * Live weather from Open-Meteo (free, no API key). Results are cached for ten
 * minutes per location. Errors are surfaced, never replaced with made-up data.
 */
export class WeatherService {
  private cache = new Map<string, { at: number; value: Weather }>();

  constructor(
    private readonly enabled: boolean,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  get available() {
    return this.enabled;
  }

  async geocode(query: string): Promise<{ name: string; latitude: number; longitude: number }> {
    const url = `https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=${encodeURIComponent(query)}`;
    const data = (await this.getJson(url)) as { results?: { name: string; country?: string; admin1?: string; latitude: number; longitude: number }[] };
    const r = data.results?.[0];
    if (!r) throw new AppError(404, 'location_not_found', `Couldn't find a place called "${query}"`);
    return { name: [r.name, r.admin1, r.country].filter(Boolean).join(', '), latitude: r.latitude, longitude: r.longitude };
  }

  async forecast(loc: { name: string; latitude: number; longitude: number }): Promise<Weather> {
    if (!this.enabled) throw new AppError(503, 'weather_disabled', 'Weather is disabled on this server');
    const key = `${loc.latitude.toFixed(2)},${loc.longitude.toFixed(2)}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < 10 * 60_000) return cached.value;

    const params = new URLSearchParams({
      latitude: String(loc.latitude),
      longitude: String(loc.longitude),
      current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      timezone: 'auto',
      forecast_days: '3',
    });
    const data = (await this.getJson(`https://api.open-meteo.com/v1/forecast?${params}`)) as {
      current?: { temperature_2m: number; apparent_temperature?: number; relative_humidity_2m?: number; wind_speed_10m?: number; weather_code: number };
      daily?: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max?: (number | null)[] };
    };
    if (!data.current || !data.daily) throw new AppError(502, 'weather_unavailable', 'Weather service returned no data');

    const value: Weather = {
      location: loc.name,
      latitude: loc.latitude,
      longitude: loc.longitude,
      current: {
        temperatureC: data.current.temperature_2m,
        apparentTemperatureC: data.current.apparent_temperature ?? null,
        humidity: data.current.relative_humidity_2m ?? null,
        windKph: data.current.wind_speed_10m ?? null,
        condition: describeWeatherCode(data.current.weather_code),
        code: data.current.weather_code,
      },
      daily: data.daily.time.map((date, i) => ({
        date,
        minC: data.daily!.temperature_2m_min[i] ?? 0,
        maxC: data.daily!.temperature_2m_max[i] ?? 0,
        precipitationChance: data.daily!.precipitation_probability_max?.[i] ?? null,
        condition: describeWeatherCode(data.daily!.weather_code[i] ?? -1),
      })),
      source: { title: 'Open-Meteo', url: 'https://open-meteo.com/' },
      fetchedAt: new Date().toISOString(),
    };
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  private async getJson(url: string): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchFn(url, { signal: AbortSignal.timeout(8000) });
    } catch {
      throw new AppError(503, 'weather_unreachable', 'Could not reach the weather service');
    }
    if (!res.ok) throw new AppError(502, 'weather_unavailable', `Weather service error (${res.status})`);
    return res.json();
  }
}

export function formatWeather(w: Weather): string {
  const c = w.current;
  const days = w.daily
    .map((d) => `${d.date}: ${d.condition}, ${Math.round(d.minC)}–${Math.round(d.maxC)}°C${d.precipitationChance != null ? `, ${d.precipitationChance}% rain` : ''}`)
    .join('\n');
  return `Weather for ${w.location} (source: Open-Meteo, fetched ${w.fetchedAt}):\nNow: ${c.condition}, ${Math.round(c.temperatureC)}°C${c.apparentTemperatureC != null ? ` (feels ${Math.round(c.apparentTemperatureC)}°C)` : ''}${c.humidity != null ? `, humidity ${c.humidity}%` : ''}${c.windKph != null ? `, wind ${Math.round(c.windKph)} km/h` : ''}\n${days}`;
}
