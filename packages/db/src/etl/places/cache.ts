/**
 * Per-run in-memory cache for the place-id resolvers (place-inference.ts). Many
 * rows resolve the same key, so this avoids repeat queries.
 */
const resolverCaches: Map<string, unknown>[] = [];

export function createCachedResolver<T>(
  lookup: (key: string) => Promise<T>
): (key: string) => Promise<T> {
  const cache = new Map<string, T>();
  resolverCaches.push(cache as Map<string, unknown>);
  return async (key: string): Promise<T> => {
    if (cache.has(key)) return cache.get(key)!;
    const result = await lookup(key);
    cache.set(key, result);
    return result;
  };
}

/** Clear every createCachedResolver cache. For tests that reseed the DB between cases —
 *  the caches are module-level with process lifetime and are NOT the query-layer TTL cache. */
export function clearResolverCaches(): void {
  for (const cache of resolverCaches) cache.clear();
}
