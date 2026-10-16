import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, type IconName } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

const ICONS: Record<OrbState, IconName> = {
  idle: 'mic',
  listening: 'mic',
  thinking: 'sparkles',
  speaking: 'volume-high',
  error: 'alert',
};

/** Animated assistant orb: pulses while listening, breathes while thinking, ripples while speaking. */
export function Orb({ state, size = 180 }: { state: OrbState; size?: number }) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);
  const halo = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(scale);
    cancelAnimation(halo);
    if (state === 'listening') {
      scale.value = withRepeat(withSequence(withTiming(1.08, { duration: 500 }), withTiming(0.97, { duration: 500 })), -1, true);
      halo.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.out(Easing.quad) }), -1, false);
    } else if (state === 'thinking') {
      scale.value = withRepeat(withSequence(withTiming(1.04, { duration: 900 }), withTiming(0.98, { duration: 900 })), -1, true);
      halo.value = withTiming(0.3, { duration: 300 });
    } else if (state === 'speaking') {
      scale.value = withRepeat(withSequence(withTiming(1.06, { duration: 260 }), withTiming(1, { duration: 260 })), -1, true);
      halo.value = withRepeat(withTiming(1, { duration: 900 }), -1, false);
    } else {
      scale.value = withTiming(1, { duration: 250 });
      halo.value = withTiming(0, { duration: 250 });
    }
  }, [state, scale, halo]);

  const orbStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.35 * (1 - halo.value),
    transform: [{ scale: 1 + halo.value * 0.45 }],
  }));

  const gradient: [string, string, string] = state === 'error' ? [colors.danger, colors.warning, colors.danger] : colors.gradient;
  return (
    <View style={{ width: size * 1.5, height: size * 1.5, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[StyleSheet.absoluteFill, { margin: size * 0.25, borderRadius: size, backgroundColor: colors.primary }, haloStyle]} />
      <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }, orbStyle]}>
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={ICONS[state]} size={size * 0.3} color="#FFFFFF" />
        </LinearGradient>
      </Animated.View>
    </View>
  );
}
