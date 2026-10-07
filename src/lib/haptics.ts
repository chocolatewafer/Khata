import { getSettings } from './format';

const PATTERNS = { light: 10, medium: 18, success: [12, 40, 12], warning: [20, 60, 20] } as const;
export type HapticKind = keyof typeof PATTERNS;

/** A short vibration on devices that support it (Android). No-ops elsewhere or when turned off in Preferences. */
export function haptic(kind: HapticKind = 'light') {
  if (!getSettings().haptics) return;
  try {
    navigator.vibrate?.(PATTERNS[kind] as number | number[]);
  } catch {
    // some browsers throw when vibrate is called without a user gesture
  }
}
