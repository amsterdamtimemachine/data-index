/**
 * Simple TTL cache for stable data that only changes after rebuild-cells.
 * Avoids server restarts after data ingestion — stale values expire automatically.
 */

const CACHE_TTL_MS = (parseInt(process.env.CACHE_TTL_MINUTES || '10', 10) || 10) * 60 * 1000;

export function createTTLCache<T>(ttlMs: number = CACHE_TTL_MS) {
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
