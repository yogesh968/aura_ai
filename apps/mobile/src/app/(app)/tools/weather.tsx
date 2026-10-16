import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import type { Weather } from '@aura/shared';
import { Button, Card, EmptyState, ErrorState, Icon, LoadingState, Screen, ScreenHeader, Text, TextField } from '@/components/ui';
import { endpoints } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/client';
import { useOnline } from '@/lib/network';
import { relativeDay, timeAgo } from '@/lib/format';
import { toast } from '@/lib/toast';
import { weatherIcon } from '@/features/workspace/weather';

type Target = { kind: 'home' } | { kind: 'query'; q: string } | { kind: 'coords'; lat: number; lon: number; name: string };

function WeatherView({ w }: { w: Weather }) {
  const c = w.current;
  return (
    <>
      <Card tone="primary" style={{ marginTop: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Icon name={weatherIcon(c.code)} size={56} color="primary" />
          <View style={{ flex: 1 }}>
            <Text variant="display">{Math.round(c.temperatureC)}°C</Text>
            <Text variant="bodyStrong">{c.condition}</Text>
          </View>
        </View>
        <Text variant="caption" color="textMuted" style={{ marginTop: 8 }}>
          {w.location}
        </Text>
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
          {c.apparentTemperatureC != null ? <Text variant="small" color="textMuted">Feels like {Math.round(c.apparentTemperatureC)}°C</Text> : null}
          {c.humidity != null ? <Text variant="small" color="textMuted">Humidity {c.humidity}%</Text> : null}
          {c.windKph != null ? <Text variant="small" color="textMuted">Wind {Math.round(c.windKph)} km/h</Text> : null}
        </View>
      </Card>
      <View style={{ gap: 8, marginTop: 12 }}>
        {w.daily.map((d) => (
          <Card key={d.date}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text variant="bodyStrong" style={{ width: 110 }}>
                {relativeDay(`${d.date}T12:00:00`)}
              </Text>
              <Text variant="caption" color="textMuted" style={{ flex: 1 }} numberOfLines={1}>
                {d.condition}
                {d.precipitationChance != null ? ` · ${d.precipitationChance}% rain` : ''}
              </Text>
              <Text variant="bodyStrong">
                {Math.round(d.minC)}° / {Math.round(d.maxC)}°
              </Text>
            </View>
          </Card>
        ))}
      </View>
      <Text variant="small" color="textSubtle" style={{ marginTop: 12 }}>
        Source: {w.source.title} ({w.source.url}) · updated {timeAgo(w.fetchedAt)}
      </Text>
    </>
  );
}

export default function WeatherScreen() {
  const online = useOnline();
  const router = useRouter();
  const [target, setTarget] = useState<Target>({ kind: 'home' });
  const [query, setQuery] = useState('');
  const [locating, setLocating] = useState(false);

  const weather = useQuery({
    queryKey: ['weather', target],
    enabled: online,
    staleTime: 5 * 60_000,
    queryFn: () =>
      target.kind === 'home' ? endpoints.weather.home() : target.kind === 'query' ? endpoints.weather.byQuery(target.q) : endpoints.weather.byCoords(target.lat, target.lon, target.name),
  });

  const locateMe = async () => {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        toast.error('Location permission is off. Search for a city instead, or allow location in system settings.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      let name = 'Current location';
      try {
        const [place] = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        if (place) name = [place.city ?? place.subregion, place.region].filter(Boolean).join(', ') || name;
      } catch {
        /* name stays generic */
      }
      setTarget({ kind: 'coords', lat: pos.coords.latitude, lon: pos.coords.longitude, name });
    } catch {
      toast.error('Could not get your location. Make sure location services are on.');
    } finally {
      setLocating(false);
    }
  };

  const noHome = weather.error instanceof ApiError && weather.error.status === 400 && target.kind === 'home';

  return (
    <Screen header={<ScreenHeader title="Weather" subtitle="Live data from Open-Meteo" />} refreshing={weather.isRefetching} onRefresh={() => void weather.refetch()}>
      <TextField
        icon="search-outline"
        placeholder="Search a city"
        value={query}
        onChangeText={setQuery}
        returnKeyType="search"
        onSubmitEditing={() => query.trim() && setTarget({ kind: 'query', q: query.trim() })}
      />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <Button title="My location" size="sm" variant="soft" icon="locate-outline" loading={locating} disabled={!online} onPress={() => void locateMe()} />
        {target.kind !== 'home' ? <Button title="Home" size="sm" variant="secondary" icon="home-outline" onPress={() => setTarget({ kind: 'home' })} /> : null}
      </View>
      <Text variant="small" color="textSubtle" style={{ marginTop: 6 }}>
        Your location is only used to look up the forecast.
      </Text>

      {!online ? (
        <EmptyState icon="cloud-offline-outline" title="You're offline" body="Weather is live data, so it needs a connection. Aura won't show a guess." />
      ) : weather.isLoading ? (
        <LoadingState compact label="Fetching forecast…" />
      ) : noHome ? (
        <EmptyState icon="home-outline" title="No home location yet" body="Search for a city, use your location, or set a home city in Settings for briefings." actionLabel="Open settings" onAction={() => router.push('/settings/assistant')} />
      ) : weather.error ? (
        <ErrorState error={weather.error} onRetry={() => void weather.refetch()} />
      ) : weather.data ? (
        <WeatherView w={weather.data} />
      ) : null}
    </Screen>
  );
}
