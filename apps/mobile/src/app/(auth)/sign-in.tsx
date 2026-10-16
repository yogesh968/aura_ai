import { useRef, useState } from 'react';
import { Alert, View, type TextInput } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Button, Card, Divider, Icon, Screen, ScreenHeader, Text, TextField } from '@/components/ui';
import { useAuthStore } from '@/lib/auth/store';
import { useSettingsStore } from '@/lib/settings';
import { PasswordField } from '@/features/account/PasswordField';
import { authErrorMessage, hasErrors, validateSignIn } from '@/features/account/validation';

export default function SignInScreen() {
  const router = useRouter();
  const consented = useSettingsStore((s) => s.consentAcceptedAt !== null);
  const signIn = useAuthStore((s) => s.signIn);
  const continueAsGuest = useAuthStore((s) => s.continueAsGuest);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'signin' | 'guest' | null>(null);
  const passwordRef = useRef<TextInput>(null);

  if (!consented) return <Redirect href="/consent" />;

  const submit = async () => {
    const v = validateSignIn({ email, password });
    setErrors(v);
    setFormError(null);
    if (hasErrors(v)) return;
    setBusy('signin');
    try {
      await signIn(email.trim(), password);
    } catch (e) {
      setFormError(authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const guest = () => {
    Alert.alert(
      'Continue as guest?',
      'A guest account is created on your AURA server so sync and AI work. You can turn it into a full account later in Settings and keep everything.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: async () => {
            setBusy('guest');
            setFormError(null);
            try {
              await continueAsGuest();
            } catch (e) {
              setFormError(authErrorMessage(e));
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  return (
    <Screen header={<ScreenHeader title="Welcome back" large subtitle="Sign in to your AURA account" onBack={() => router.replace('/welcome')} />}>
      <Animated.View entering={FadeInDown.duration(250)} style={{ gap: 16 }}>
        {formError ? (
          <Card tone="danger" style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Icon name="alert-circle-outline" size={20} color="danger" />
            <Text variant="caption" color="danger" style={{ flex: 1 }} accessibilityLiveRegion="assertive">
              {formError}
            </Text>
          </Card>
        ) : null}
        <TextField
          label="Email"
          icon="mail-outline"
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            if (errors.email) setErrors((e) => ({ ...e, email: undefined }));
          }}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          error={errors.email}
        />
        <PasswordField
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            if (errors.password) setErrors((e) => ({ ...e, password: undefined }));
          }}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
          error={errors.password}
        />
        <Button title="Sign in" size="lg" fullWidth loading={busy === 'signin'} disabled={busy !== null} onPress={submit} />
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
          <Text variant="caption" color="textMuted">
            New to AURA?
          </Text>
          <Button title="Create an account" variant="ghost" size="sm" onPress={() => router.push('/sign-up')} />
        </View>
        <Divider />
        <Button title="Continue as guest" variant="secondary" fullWidth icon="person-outline" loading={busy === 'guest'} disabled={busy !== null} onPress={guest} />
        <Text variant="small" color="textSubtle" align="center">
          Guest data lives on your server under a guest account and can be upgraded to a full account later.
        </Text>
      </Animated.View>
    </Screen>
  );
}
