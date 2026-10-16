import { create } from 'zustand';
import Storage from 'expo-sqlite/kv-store';
import { defaultPreferences, type Preferences } from '@aura/shared';

/**
 * Device-local settings mirror. Preferences live on the server (per account)
 * and are cached here so the app renders correctly offline and before the
 * first network response.
 */
interface SettingsState {
  hydrated: boolean;
  theme: Preferences['theme'];
  preferences: Preferences;
  onboardingComplete: boolean;
  consentAcceptedAt: string | null;
  /** Device-only toggles (not synced). */
  deviceCalendarSync: boolean;
  hydrate: () => Promise<void>;
  setPreferences: (p: Preferences) => void;
  setOnboardingComplete: (v: boolean) => void;
  setConsentAccepted: () => void;
  setDeviceCalendarSync: (v: boolean) => void;
  reset: () => void;
}

const KEY = 'aura.settings.v1';

type Persisted = Pick<SettingsState, 'preferences' | 'onboardingComplete' | 'consentAcceptedAt' | 'deviceCalendarSync'>;

function persist(state: SettingsState) {
  const data: Persisted = {
    preferences: state.preferences,
    onboardingComplete: state.onboardingComplete,
    consentAcceptedAt: state.consentAcceptedAt,
    deviceCalendarSync: state.deviceCalendarSync,
  };
  Storage.setItem(KEY, JSON.stringify(data)).catch(() => undefined);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  hydrated: false,
  theme: defaultPreferences.theme,
  preferences: defaultPreferences,
  onboardingComplete: false,
  consentAcceptedAt: null,
  deviceCalendarSync: false,
  hydrate: async () => {
    try {
      const raw = await Storage.getItem(KEY);
      if (raw) {
        const data = JSON.parse(raw) as Partial<Persisted>;
        const preferences = { ...defaultPreferences, ...(data.preferences ?? {}) };
        set({
          preferences,
          theme: preferences.theme,
          onboardingComplete: Boolean(data.onboardingComplete),
          consentAcceptedAt: data.consentAcceptedAt ?? null,
          deviceCalendarSync: Boolean(data.deviceCalendarSync),
        });
      }
    } finally {
      set({ hydrated: true });
    }
  },
  setPreferences: (preferences) => {
    set({ preferences, theme: preferences.theme });
    persist(get());
  },
  setOnboardingComplete: (onboardingComplete) => {
    set({ onboardingComplete });
    persist(get());
  },
  setConsentAccepted: () => {
    set({ consentAcceptedAt: new Date().toISOString() });
    persist(get());
  },
  setDeviceCalendarSync: (deviceCalendarSync) => {
    set({ deviceCalendarSync });
    persist(get());
  },
  reset: () => {
    set({ preferences: defaultPreferences, theme: defaultPreferences.theme, deviceCalendarSync: false });
    persist(get());
  },
}));
