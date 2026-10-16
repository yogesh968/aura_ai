import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Button, Sheet, Text, TextField } from '@/components/ui';
import { getApiBaseUrl, getDefaultApiBaseUrl, setApiBaseUrl } from '@/lib/api/config';
import { checkServerHealth, errorMessage } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/store';
import { useSyncStore } from '@/lib/sync/engine';
import { toast } from '@/lib/toast';

/** Editor for the backend address, shared by the welcome flow and Settings → Server. */
export function ServerUrlEditor({ onSaved }: { onSaved?: () => void }) {
  const [url, setUrl] = useState(getApiBaseUrl());
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const signedIn = useAuthStore((s) => s.status === 'signedIn');

  // Probe the candidate directly: the app's configured server and tokens are never touched.
  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      const h = await checkServerHealth(url);
      setResult({ ok: true, text: `Connected · v${h.version} · AI ${h.ai.available ? `ready (${h.ai.model ?? h.ai.provider})` : 'not configured'}` });
    } catch (e) {
      setResult({ ok: false, text: errorMessage(e, 'Could not connect') });
    } finally {
      setTesting(false);
    }
  };

  /**
   * Accounts and sessions belong to one server. Switching while signed in signs out first,
   * so tokens and unsynced changes are never sent to a different server.
   */
  const apply = async (next: string | null) => {
    const target = next?.trim().replace(/\/+$/, '') || getDefaultApiBaseUrl();
    if (target === getApiBaseUrl()) {
      toast.info('That server is already in use');
      return;
    }
    const commit = async () => {
      try {
        if (signedIn) await useAuthStore.getState().signOut();
        await setApiBaseUrl(next);
        setUrl(getApiBaseUrl());
        setResult(null);
        toast.success(signedIn ? 'Server changed. Sign in to continue.' : 'Server address saved');
        onSaved?.();
      } catch (e) {
        setError(errorMessage(e));
      }
    };
    if (!signedIn) return commit();
    const pending = useSyncStore.getState().pending;
    Alert.alert(
      'Switch server and sign out?',
      `Your account lives on the current server. Switching signs you out and removes its data from this phone.${pending > 0 ? ` ${pending} change${pending === 1 ? ' has' : 's have'} not synced yet and will be lost.` : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out & switch', style: 'destructive', onPress: () => void commit() },
      ],
    );
  };

  const save = async () => {
    setError(null);
    // Validate before any sign-out prompt so a typo never costs a session.
    if (!/^https?:\/\/[^\s]+$/i.test(url.trim())) {
      setError('Enter a URL starting with http:// or https://');
      return;
    }
    await apply(url);
  };

  const reset = () => apply(null);

  return (
    <View style={{ gap: 12 }}>
      <TextField
        label="Server address"
        value={url}
        onChangeText={(t) => {
          setUrl(t);
          setError(null);
          setResult(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="http://192.168.1.20:4000"
        error={error}
        helper={`Default: ${getDefaultApiBaseUrl()}. On a physical phone use your computer's LAN IP, or your HTTPS server.`}
      />
      {result ? (
        <Text variant="caption" color={result.ok ? 'success' : 'danger'} accessibilityLiveRegion="polite">
          {result.text}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Button title="Test connection" variant="secondary" size="sm" icon="pulse-outline" loading={testing} onPress={test} />
        <Button title="Save" size="sm" onPress={save} />
        <Button title="Reset to default" variant="ghost" size="sm" onPress={reset} />
      </View>
    </View>
  );
}

export function ServerUrlSheet({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved?: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Server settings">
      {visible ? (
        <ServerUrlEditor
          onSaved={() => {
            onSaved?.();
            onClose();
          }}
        />
      ) : null}
    </Sheet>
  );
}
