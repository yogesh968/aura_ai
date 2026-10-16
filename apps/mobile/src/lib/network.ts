import { useEffect } from 'react';
import * as Network from 'expo-network';
import { create } from 'zustand';

interface NetworkState {
  online: boolean;
  /** True once we've received at least one reading. */
  known: boolean;
}

export const useNetworkStore = create<NetworkState>(() => ({ online: true, known: false }));

function toOnline(s: Network.NetworkState) {
  // isInternetReachable may be undefined/null initially; trust isConnected then.
  return Boolean(s.isConnected) && s.isInternetReachable !== false;
}

/** Mount once at the root: keeps the network store current and calls `onReconnect`. */
export function useNetworkMonitor(onReconnect: () => void) {
  useEffect(() => {
    let previous = useNetworkStore.getState().online;
    Network.getNetworkStateAsync()
      .then((s) => useNetworkStore.setState({ online: toOnline(s), known: true }))
      .catch(() => useNetworkStore.setState({ known: true }));
    const sub = Network.addNetworkStateListener((s) => {
      const online = toOnline(s);
      useNetworkStore.setState({ online, known: true });
      if (online && !previous) onReconnect();
      previous = online;
    });
    return () => sub.remove();
  }, [onReconnect]);
}

export function useOnline() {
  return useNetworkStore((s) => s.online);
}
