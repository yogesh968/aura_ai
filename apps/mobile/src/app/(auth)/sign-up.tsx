import { useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Button, Card, Icon, ProgressBar, Screen, ScreenHeader, Text, TextField } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuthStore } from '@/lib/auth/store';
import { useSettingsStore } from '@/lib/settings';
import { PasswordField } from '@/features/account/PasswordField';
import { authErrorMessage, hasErrors, passwordStrength, validateSignUp, type FieldErrors } from '@/features/account/validation';

type Field = 'name' | 'email' | 'password' | 'confirm';
const STRENGTH = ['Too short', 'Okay', 'Good', 'Strong'] as const;

export default function SignUpScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const consented = useSettingsStore((s) => s.consentAcceptedAt !== null);
  const signUp = useAuthStore((s) => s.signUp);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  if (!consented) return <Redirect href="/consent" />;

  const set = (k: Field) => (t: string) => {
    setForm((f) => ({ ...f, [k]: t }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = async () => {
    const v = validateSignUp(form);
    setErrors(v);
    setFormError(null);
    if (hasErrors(v)) return;
    setBusy(true);
    try {
      await signUp(form.name.trim(), form.email.trim(), form.password);
    } catch (e) {
      setFormError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const strength = passwordStrength(form.password);
  const strengthColor = [colors.danger, colors.warning, colors.info, colors.success][strength];

  return (
    <Screen header={<ScreenHeader title="Create your account" large subtitle="It takes less than a minute" />}>
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
          label="Your name"
          icon="person-outline"
          value={form.name}
          onChangeText={set('name')}
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          error={errors.name}
        />
        <TextField
          ref={emailRef}
          label="Email"
          icon="mail-outline"
          value={form.email}
          onChangeText={set('email')}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          error={errors.email}
        />
        <View style={{ gap: 8 }}>
          <PasswordField
            ref={passwordRef}
            label="Password"
            value={form.password}
            onChangeText={set('password')}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            error={errors.password}
            helper="At least 8 characters"
          />
          {form.password ? (
            <View style={{ gap: 4 }}>
              <ProgressBar value={(strength + 1) / 4} color={strengthColor} height={6} label="Password strength" />
              <Text variant="small" color="textMuted">
                {STRENGTH[strength]}
              </Text>
            </View>
          ) : null}
        </View>
        <PasswordField
          ref={confirmRef}
          label="Confirm password"
          value={form.confirm}
          onChangeText={set('confirm')}
          autoComplete="new-password"
          returnKeyType="go"
          onSubmitEditing={submit}
          error={errors.confirm}
        />
        <Button title="Create account" size="lg" fullWidth loading={busy} onPress={submit} />
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
          <Text variant="caption" color="textMuted">
            Already have an account?
          </Text>
          <Button title="Sign in" variant="ghost" size="sm" onPress={() => (router.canGoBack() ? router.back() : router.replace('/sign-in'))} />
        </View>
      </Animated.View>
    </Screen>
  );
}
