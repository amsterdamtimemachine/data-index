/**
 * Simple TTL cache for stable data that only changes after rebuild-cells.
 * Avoids server restarts after data ingestion — stale values expire automatically.
 */
export function createTTLCache<T>(ttlMs: number) {
  let data: T | null = null;
  let expires = 0;
  return {
    get(): T | null {
      if (Date.now() < expires) return data;
      data = null;
      return null;
    },
    set(value: T) { data = value; expires = Date.now() + ttlMs; }
  };
}
