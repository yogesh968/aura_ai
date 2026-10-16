import { forwardRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { IconButton, TextField, type IconName } from '@/components/ui';
import type { TextFieldProps } from '@/components/ui/Fields';

/** Password input with a show/hide toggle. */
export const PasswordField = forwardRef<TextInput, TextFieldProps>(function PasswordField(props, ref) {
  const [visible, setVisible] = useState(false);
  const icon: IconName = visible ? 'eye-off-outline' : 'eye-outline';
  return (
    <TextField
      ref={ref}
      icon="lock-closed-outline"
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      right={<IconButton icon={icon} label={visible ? 'Hide password' : 'Show password'} size={20} onPress={() => setVisible((v) => !v)} />}
      {...props}
    />
  );
});
