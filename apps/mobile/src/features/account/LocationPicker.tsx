import { useState } from 'react';
import { Linking, View } from 'react-native';
import * as Location from 'expo-location';
import type { Preferences } from '@aura/shared';
import { Button, Card, Icon, Text, TextField } from '@/components/ui';
import { endpoints } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/client';

type Loc = NonNullable<Preferences['location']>;

/** Set the home location by city search (server geocoding) or GPS (foreground permission). */
export function LocationPicker({ value, onChange }: { value: Preferences['location']; onChange: (loc: Loc | null) => Promise<void> | void }) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<'search' | 'gps' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setBusy('search');
    setError(null);
    try {
      const loc = await endpoints.weather.geocode(query.trim());
      await onChange(loc);
      setQuery('');
    } catch (e) {
      setError(errorMessage(e, "Couldn't find that place"));
    } finally {
      setBusy(null);
    }
  };

  const useGps = async () => {
    setBusy('gps');
    setError(null);
    setBlocked(false);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setBlocked(!perm.canAskAgain);
        setError('Location permission was not granted. You can type your city instead.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      let name = 'Current location';
      try {
        const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (place) name = [place.city ?? place.subregion, place.region, place.country].filter(Boolean).join(', ') || name;
      } catch {
        /* name stays generic */
      }
      await onChange({ name, latitude: Number(latitude.toFixed(4)), longitude: Number(longitude.toFixed(4)) });
    } catch (e) {
      setError(errorMessage(e, "Couldn't get your location"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      {value ? (
        <Card tone="alt" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="location" size={18} color="primary" />
          <Text variant="body" style={{ flex: 1 }} numberOfLines={2}>
            {value.name}
          </Text>
          <Button title="Remove" variant="ghost" size="sm" onPress={() => void onChange(null)} />
        </Card>
      ) : null}
      <TextField
        label={value ? 'Change city' : 'City'}
        icon="search-outline"
        placeholder="e.g. Pune"
        value={query}
        onChangeText={setQuery}
        returnKeyType="search"
        onSubmitEditing={search}
        error={error}
      />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Button title="Search" size="sm" variant="soft" icon="search" loading={busy === 'search'} disabled={!query.trim() || busy !== null} onPress={search} />
        <Button title="Use my location" size="sm" variant="secondary" icon="navigate-outline" loading={busy === 'gps'} disabled={busy !== null} onPress={useGps} />
        {blocked ? <Button title="Open settings" size="sm" variant="ghost" onPress={() => void Linking.openSettings()} /> : null}
      </View>
    </View>
  );
}
