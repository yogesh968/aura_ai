import { Card, Screen, ScreenHeader, Text } from '@/components/ui';
import { ServerUrlEditor } from '@/features/account/ServerUrlSheet';

export default function ServerSettingsScreen() {
  return (
    <Screen header={<ScreenHeader title="Server" />}>
      <Card style={{ gap: 16 }}>
        <Text variant="caption" color="textMuted">
          AURA talks to your own backend. Your account and data live on that server. Switching to another server signs you out of this one.
        </Text>
        {/* Switching servers signs the user out, so there is nothing to refresh here. */}
        <ServerUrlEditor />
      </Card>
      <Text variant="small" color="textSubtle" style={{ marginTop: 16 }}>
        Use HTTPS for anything other than local development. Accounts are per server: signing in to a different server shows that server’s data.
      </Text>
    </Screen>
  );
}
