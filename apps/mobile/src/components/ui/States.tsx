import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { ApiError, isNetworkError, errorMessage } from '@/lib/api/client';
import { useOnline } from '@/lib/network';
import { timeAgo } from '@/lib/format';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export function LoadingState({ label = 'Loading…', compact }: { label?: string; compact?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.center, compact ? { paddingVertical: 24 } : { flex: 1, paddingVertical: 64 }]} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text variant="caption" color="textMuted" style={{ marginTop: 12 }}>
        {label}
      </Text>
    </View>
  );
}

export interface EmptyStateProps {
  icon: IconName;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

export function EmptyState({ icon, title, body, actionLabel, onAction, compact }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.center, { paddingVertical: compact ? 24 : 56, paddingHorizontal: 24 }]}>
      <Icon name={icon} size={52} color={colors.textSubtle} />
      <Text variant="heading" weight="700" align="center" style={{ marginTop: 12 }}>
        {title}
      </Text>
      {body ? (
        <Text variant="caption" color="textMuted" align="center" style={{ marginTop: 6, maxWidth: 320 }}>
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? <Button title={actionLabel} onPress={onAction} size="sm" variant="ghost" style={{ marginTop: 8 }} /> : null}
    </View>
  );
}

/**
 * Error display that distinguishes "you're offline" from server errors and
 * "AI not configured", always with a retry when possible.
 */
export function ErrorState({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const offline = isNetworkError(error);
  const aiOff = error instanceof ApiError && error.code === 'ai_unavailable';
  const icon: IconName = offline ? 'cloud-offline-outline' : aiOff ? 'sparkles-outline' : 'alert-circle-outline';
  const title = offline ? "You're offline" : aiOff ? 'AI is not set up on the server' : "Couldn't load this";
  const body = offline
    ? 'This needs an internet connection. Your offline features keep working.'
    : aiOff
      ? 'Ask the server admin to add an AI provider key. Tasks, notes and everything offline still work.'
      : errorMessage(error);
  return <EmptyState icon={icon} title={title} body={body} actionLabel={onRetry ? 'Try again' : undefined} onAction={onRetry} compact={compact} />;
}

export function OfflineBanner() {
  const online = useOnline();
  const { colors } = useTheme();
  if (online) return null;
  return (
    <View style={[styles.banner, { backgroundColor: colors.warningSoft }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Icon name="cloud-offline-outline" size={16} color="warning" />
      <Text variant="small" color="warning" style={{ flex: 1 }}>
        Offline — changes are saved on this phone and will sync later.
      </Text>
    </View>
  );
}

/** Shown when data comes from the offline cache. */
export function StaleBanner({ cachedAt }: { cachedAt: string | null | undefined }) {
  const { colors } = useTheme();
  if (!cachedAt) return null;
  return (
    <View style={[styles.banner, { backgroundColor: colors.surfaceAlt, borderRadius: 12, marginBottom: 12 }]}>
      <Icon name="time-outline" size={16} color="textMuted" />
      <Text variant="small" color="textMuted">
        {`Showing saved copy from ${timeAgo(cachedAt)} — couldn't refresh.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
});
