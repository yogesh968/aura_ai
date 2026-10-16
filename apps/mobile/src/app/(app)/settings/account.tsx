import { useState } from 'react';
import { View } from 'react-native';
import { Avatar, Badge, Button, Card, Screen, ScreenHeader, SectionHeader, Text, TextField } from '@/components/ui';
import { endpoints } from '@/lib/api/endpoints';
import { useAuthStore } from '@/lib/auth/store';
import { formatDate } from '@/lib/format';
import { toast } from '@/lib/toast';
import { PasswordField } from '@/features/account/PasswordField';
import { authErrorMessage, hasErrors, validateSignUp, type FieldErrors } from '@/features/account/validation';

export default function AccountScreen() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const claimGuest = useAuthStore((s) => s.claimGuest);
  const [name, setName] = useState(user?.name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [claim, setClaim] = useState({ name: user?.isGuest && user.name !== 'Guest' ? user.name : '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<FieldErrors<'name' | 'email' | 'password' | 'confirm'>>({});
  const [claiming, setClaiming] = useState(false);

  if (!user) return null;

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Name cannot be empty');
      return;
    }
    setSavingName(true);
    try {
      setUser(await endpoints.auth.updateMe({ name: trimmed }));
      toast.success('Name updated');
    } catch (e) {
      toast.error(authErrorMessage(e));
    } finally {
      setSavingName(false);
    }
  };

  const doClaim = async () => {
    const v = validateSignUp(claim);
    setErrors(v);
    if (hasErrors(v)) return;
    setClaiming(true);
    try {
      await claimGuest(claim.name.trim(), claim.email.trim(), claim.password);
      toast.success('Account created — all your data is kept');
    } catch (e) {
      toast.error(authErrorMessage(e));
    } finally {
      setClaiming(false);
    }
  };

  const setField = (k: keyof typeof claim) => (t: string) => {
    setClaim((c) => ({ ...c, [k]: t }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  return (
    <Screen header={<ScreenHeader title="Account" />}>
      <Card style={{ alignItems: 'center', gap: 10 }}>
        <Avatar name={user.name} size={72} />
        <Text variant="heading">{user.name}</Text>
        {user.isGuest ? <Badge label="Guest account" tone="warning" /> : <Text variant="caption" color="textMuted">{user.email ?? ''}</Text>}
        <Text variant="small" color="textSubtle">{`Member since ${formatDate(user.createdAt)}`}</Text>
      </Card>

      <SectionHeader title="Profile" />
      <Card style={{ gap: 12 }}>
        <TextField label="Display name" icon="person-outline" value={name} onChangeText={setName} maxLength={80} autoComplete="name" />
        <Button title="Save name" size="sm" variant="soft" loading={savingName} disabled={name.trim() === user.name} onPress={saveName} style={{ alignSelf: 'flex-start' }} />
      </Card>

      {user.isGuest ? (
        <>
          <SectionHeader title="Create a full account" />
          <Card style={{ gap: 14 }}>
            <Text variant="caption" color="textMuted">
              Add an email and password to keep your data safe and sign in on other devices. Everything you have now stays in your account.
            </Text>
            <TextField label="Name" icon="person-outline" value={claim.name} onChangeText={setField('name')} error={errors.name} />
            <TextField label="Email" icon="mail-outline" value={claim.email} onChangeText={setField('email')} autoCapitalize="none" keyboardType="email-address" autoComplete="email" error={errors.email} />
            <PasswordField label="Password" value={claim.password} onChangeText={setField('password')} autoComplete="new-password" error={errors.password} helper="At least 8 characters" />
            <PasswordField label="Confirm password" value={claim.confirm} onChangeText={setField('confirm')} autoComplete="new-password" error={errors.confirm} />
            <Button title="Create account" loading={claiming} onPress={doClaim} />
          </Card>
        </>
      ) : (
        <View style={{ marginTop: 16 }}>
          <Text variant="small" color="textSubtle">
            To change your email or password, contact your AURA server administrator. Sign-out and account deletion are in Privacy & data.
          </Text>
        </View>
      )}
    </Screen>
  );
}
