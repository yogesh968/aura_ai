import * as Speech from 'expo-speech';
import { voiceLocale } from './recognition';

/** Text-to-speech for assistant replies (expo-speech, works in Expo Go). */

export function stripForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' (code omitted) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!?\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'a link')
    .replace(/[*_#>~|]/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Pick a speech locale: Devanagari text is spoken in Hindi regardless of the preference. */
export function speechLanguage(text: string, preference: string): string {
  if (/[ऀ-ॿ]/.test(text)) return preference === 'mr' ? 'mr-IN' : 'hi-IN';
  return voiceLocale(preference);
}

function chunk(text: string, max = 3500): string[] {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const cut = Math.max(rest.lastIndexOf('. ', max), rest.lastIndexOf('। ', max), rest.lastIndexOf(' ', max));
    const at = cut > max * 0.5 ? cut + 1 : max;
    parts.push(rest.slice(0, at));
    rest = rest.slice(at);
  }
  if (rest.trim()) parts.push(rest);
  return parts;
}

export interface SpeakOptions {
  language: string;
  rate?: number;
  pitch?: number;
  voice?: string | null;
  onStart?: () => void;
  onDone?: () => void;
  onError?: (e: Error) => void;
}

export function speak(text: string, opts: SpeakOptions) {
  const clean = stripForSpeech(text);
  if (!clean) {
    opts.onDone?.();
    return;
  }
  const parts = chunk(clean);
  const language = speechLanguage(clean, opts.language);
  parts.forEach((part, i) =>
    Speech.speak(part, {
      language,
      rate: opts.rate ?? 1,
      pitch: opts.pitch ?? 1,
      ...(opts.voice ? { voice: opts.voice } : {}),
      onStart: i === 0 ? opts.onStart : undefined,
      onDone: i === parts.length - 1 ? opts.onDone : undefined,
      onStopped: i === parts.length - 1 ? opts.onDone : undefined,
      onError: opts.onError,
    }),
  );
}

export function stopSpeaking() {
  return Speech.stop();
}

export function isSpeaking() {
  return Speech.isSpeakingAsync();
}

export async function availableVoices() {
  try {
    return await Speech.getAvailableVoicesAsync();
  } catch {
    return [];
  }
}
