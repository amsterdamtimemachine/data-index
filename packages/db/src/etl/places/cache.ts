/**
 * Per-run in-memory cache for the place-id resolvers (place-inference.ts). Many
 * rows resolve the same key, so this avoids repeat queries. It holds the lookup under
 * way, not just its result, so rows resolved at the same time share one query; a
 * lookup that fails is forgotten, so the next row asks again.
 */
const resolverCaches: Map<string, unknown>[] = [];

export function createCachedResolver<T>(
  lookup: (key: string) => Promise<T>
): (key: string) => Promise<T> {
  const cache = new Map<string, Promise<T>>();
  resolverCaches.push(cache as Map<string, unknown>);
  return (key: string): Promise<T> => {
    const cached = cache.get(key);
    if (cached) return cached;
    const pending = lookup(key).catch((error) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, pending);
    return pending;
  };
}

/** Clear every createCachedResolver cache. For tests that reseed the DB between cases —
 *  the caches are module-level with process lifetime and are NOT the query-layer TTL cache. */
export function clearResolverCaches(): void {
  for (const cache of resolverCaches) cache.clear();
}
