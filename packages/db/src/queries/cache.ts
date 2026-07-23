/**
 * Simple TTL cache for stable data that only changes after rebuild-cells.
 * Avoids server restarts after data ingestion — stale values expire automatically.
 */

// Minutes from env; default 10. A literal 0 DISABLES caching — note the old
// `parseInt(x) || 10` turned 0 into 10 (0 is falsy), so the test env's
// CACHE_TTL_MINUTES=0 silently cached for 10 minutes. Parse explicitly instead.
const rawMinutes = process.env.CACHE_TTL_MINUTES;
const parsedMinutes = rawMinutes === undefined || rawMinutes === '' ? 10 : parseInt(rawMinutes, 10);
const CACHE_TTL_MS = (Number.isNaN(parsedMinutes) ? 10 : parsedMinutes) * 60 * 1000;

export function createTTLCache<T>(ttlMs: number = CACHE_TTL_MS) {
  let data: T | null = null;
  let expires = 0;
  return {
    get(): T | null {
      if (ttlMs > 0 && Date.now() < expires) return data;
      data = null;
      return null;
    },
    set(value: T) {
      if (ttlMs <= 0) return; // caching disabled
      data = value;
      expires = Date.now() + ttlMs;
    }
  };
}
