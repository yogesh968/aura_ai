import { QueryClient, useQuery, type QueryKey } from '@tanstack/react-query';
import type { EntityMap, EntityType } from '@aura/shared';
import { ApiError, isNetworkError } from '@/lib/api/client';
import { cacheGet, cacheSet } from '@/lib/db/database';
import { getEntity, listEntities, subscribeToChanges } from '@/lib/db/repo';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't hammer the server on client errors; retry transient failures twice.
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && !isNetworkError(err) && count < 2,
      staleTime: 30_000,
      networkMode: 'always',
    },
    mutations: { networkMode: 'always' },
  },
});

// Local writes and synced changes refresh every screen showing that entity type.
subscribeToChanges((types) => {
  for (const type of types) {
    void queryClient.invalidateQueries({ queryKey: ['entities', type] });
    void queryClient.invalidateQueries({ queryKey: ['entity', type] });
  }
});

/** All non-deleted records of a type from the local database (works offline). */
export function useEntities<T extends EntityType>(type: T) {
  return useQuery({
    queryKey: ['entities', type],
    queryFn: () => listEntities(type),
    staleTime: Infinity,
  }) as ReturnType<typeof useQuery<EntityMap[T][]>>;
}

export function useEntity<T extends EntityType>(type: T, id: string | undefined) {
  return useQuery({
    queryKey: ['entity', type, id],
    queryFn: () => (id ? getEntity(type, id) : null),
    enabled: Boolean(id),
    staleTime: Infinity,
  }) as ReturnType<typeof useQuery<EntityMap[T] | null>>;
}

export interface CachedResult<T> {
  data: T;
  /** Set when the data came from the offline cache instead of the server. */
  cachedAt: string | null;
}

/**
 * Online-only data with an offline fallback: successful responses are cached
 * locally; when the server is unreachable the last good copy is returned and
 * flagged with `cachedAt` so the UI can say so. Never invents data.
 */
export function useCachedQuery<T>(key: QueryKey, fn: () => Promise<T>, opts: { enabled?: boolean; staleTime?: number } = {}) {
  const cacheKey = JSON.stringify(key);
  return useQuery<CachedResult<T>>({
    queryKey: key,
    enabled: opts.enabled,
    staleTime: opts.staleTime ?? 30_000,
    queryFn: async () => {
      try {
        const data = await fn();
        void cacheSet(cacheKey, data);
        return { data, cachedAt: null };
      } catch (e) {
        if (isNetworkError(e)) {
          const cached = await cacheGet<T>(cacheKey);
          if (cached) return { data: cached.value, cachedAt: cached.updatedAt };
        }
        throw e;
      }
    },
  });
}
