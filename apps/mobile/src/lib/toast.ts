import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
  kind: 'success' | 'error' | 'info';
  action?: { label: string; onPress: () => void };
}

interface ToastState {
  toasts: Toast[];
  show: (t: Omit<Toast, 'id'>, durationMs?: number) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (t, durationMs = 3500) => {
    const id = nextId++;
    set({ toasts: [...get().toasts.slice(-2), { ...t, id }] });
    setTimeout(() => get().dismiss(id), t.action ? Math.max(durationMs, 5000) : durationMs);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}));

/** Fire-and-forget toasts usable from anywhere (including non-React code). */
export const toast = {
  success: (message: string, action?: Toast['action']) => useToastStore.getState().show({ message, kind: 'success', action }),
  error: (message: string) => useToastStore.getState().show({ message, kind: 'error' }, 5000),
  info: (message: string, action?: Toast['action']) => useToastStore.getState().show({ message, kind: 'info', action }),
};
