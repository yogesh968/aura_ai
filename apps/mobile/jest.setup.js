/* global jest */
// Native modules that have no JS fallback in the Jest environment.
jest.mock('expo-sqlite/kv-store', () => {
  const store = new Map();
  return {
    __esModule: true,
    default: {
      getItem: async (k) => (store.has(k) ? store.get(k) : null),
      setItem: async (k, v) => void store.set(k, v),
      removeItem: async (k) => void store.delete(k),
    },
  };
});
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
