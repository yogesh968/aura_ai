import { useCallback, useEffect, useRef, useState } from 'react';
import { requireOptionalNativeModule } from 'expo';
import type * as SpeechRecognitionTypes from 'expo-speech-recognition';

/**
 * Speech-to-text via Android's on-device SpeechRecognizer (expo-speech-recognition).
 * The native module only exists in a development/production build, not in
 * Expo Go, so it is loaded defensively and the UI shows an honest
 * "unavailable" state instead of crashing.
 */
type Module = typeof SpeechRecognitionTypes;

let cached: Module | null | undefined;
function loadModule(): Module | null {
  if (cached !== undefined) return cached;
  try {
    cached = requireOptionalNativeModule('ExpoSpeechRecognition')
      ? // eslint-disable-next-line @typescript-eslint/no-require-imports
        (require('expo-speech-recognition') as Module)
      : null;
  } catch {
    cached = null;
  }
  return cached;
}

export type VoiceAvailability = 'available' | 'needs-dev-build' | 'no-recognizer';

export function voiceAvailability(): VoiceAvailability {
  const mod = loadModule();
  if (!mod) return 'needs-dev-build';
  try {
    return mod.ExpoSpeechRecognitionModule.isRecognitionAvailable() ? 'available' : 'no-recognizer';
  } catch {
    return 'no-recognizer';
  }
}

export type VoiceState = 'idle' | 'listening' | 'error';

export interface VoiceError {
  code: string;
  message: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'Microphone permission is off. Allow it in Settings to talk to AURA.',
  'no-speech': "I didn't catch anything. Tap the mic and try again.",
  'speech-timeout': "I didn't catch anything. Tap the mic and try again.",
  network: 'Speech recognition needs a connection on this device.',
  'audio-capture': 'The microphone is busy or unavailable.',
  busy: 'The speech service is busy. Try again in a moment.',
  'language-not-supported': 'This language is not supported by the speech service on this phone.',
};

export function voiceLocale(language: string): string {
  const map: Record<string, string> = {
    en: 'en-IN',
    hinglish: 'en-IN',
    auto: 'en-IN',
    hi: 'hi-IN',
    es: 'es-ES',
    fr: 'fr-FR',
    de: 'de-DE',
    bn: 'bn-IN',
    ta: 'ta-IN',
    te: 'te-IN',
    mr: 'mr-IN',
  };
  return map[language] ?? 'en-IN';
}

/** Hook wrapping start/stop/abort plus interim and final transcripts. */
export function useVoiceInput(opts: { lang: string; onFinal?: (text: string) => void }) {
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<VoiceError | null>(null);
  const availability = voiceAvailability();
  const onFinalRef = useRef(opts.onFinal);
  useEffect(() => {
    onFinalRef.current = opts.onFinal;
  }, [opts.onFinal]);
  const finalText = useRef('');

  useEffect(() => {
    const mod = loadModule();
    if (!mod) return;
    const m = mod.ExpoSpeechRecognitionModule;
    const subs = [
      m.addListener('start', () => {
        finalText.current = '';
        setTranscript('');
        setError(null);
        setState('listening');
      }),
      m.addListener('result', (e) => {
        const text = e.results[0]?.transcript ?? '';
        setTranscript(text);
        if (e.isFinal) finalText.current = text;
      }),
      m.addListener('error', (e) => {
        if (e.error === 'aborted') return;
        setError({ code: e.error, message: ERROR_MESSAGES[e.error] ?? e.message ?? 'Voice input failed.' });
        setState('error');
      }),
      m.addListener('end', () => {
        setState((s) => (s === 'error' ? s : 'idle'));
        const text = finalText.current.trim();
        if (text) onFinalRef.current?.(text);
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);

  const start = useCallback(async () => {
    const mod = loadModule();
    if (!mod) {
      setError({ code: 'unavailable', message: 'Voice input needs the AURA development build (it is not available in Expo Go).' });
      setState('error');
      return false;
    }
    const perm = await mod.ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      setError({ code: 'not-allowed', message: ERROR_MESSAGES['not-allowed']! });
      setState('error');
      return false;
    }
    mod.ExpoSpeechRecognitionModule.start({
      lang: opts.lang,
      interimResults: true,
      continuous: false,
      maxAlternatives: 1,
      addsPunctuation: true,
    });
    return true;
  }, [opts.lang]);

  const stop = useCallback(() => loadModule()?.ExpoSpeechRecognitionModule.stop(), []);
  const abort = useCallback(() => {
    loadModule()?.ExpoSpeechRecognitionModule.abort();
    setState('idle');
  }, []);
  const reset = useCallback(() => {
    setError(null);
    setTranscript('');
    setState('idle');
  }, []);

  return { availability, state, transcript, error, start, stop, abort, reset };
}
