import { Stack } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';

/** Signed-out flow: welcome → consent → sign in / sign up / guest. */
export default function AuthLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="consent" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
    </Stack>
  );
}
