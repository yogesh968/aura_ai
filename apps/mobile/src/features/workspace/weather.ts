import type { IconName } from '@/components/ui';

/** Ionicon for a WMO weather code. */
export function weatherIcon(code: number): IconName {
  if (code === 0 || code === 1) return 'sunny-outline';
  if (code === 2) return 'partly-sunny-outline';
  if (code === 3 || code === 45 || code === 48) return 'cloudy-outline';
  if (code >= 51 && code <= 67) return 'rainy-outline';
  // Rain showers (80-82) sit inside the snow range numerically, so they're matched first.
  if (code >= 80 && code <= 82) return 'rainy-outline';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow-outline';
  if (code >= 95) return 'thunderstorm-outline';
  return 'cloud-outline';
}
