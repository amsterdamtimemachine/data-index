// Feature → place resolution config.

// parse an int env that ALLOWS 0 (a `|| default` would swallow it); falls back on unset/NaN.
const intEnv = (name: string, def: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return def;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : def;
};

// parse a YYYY-MM-DD env, failing fast at startup on a malformed value (rather than a
// cryptic per-feature Postgres error later).
const dateEnv = (name: string, def: string): string => {
  const v = process.env[name]?.trim() || def;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${name} must be YYYY-MM-DD, got "${v}"`);
  return v;
};

// Point-resolution proximity caps (metres, RD/28992): how far a feature's coordinate may
// sit from a candidate before we refuse to link it. Areas match by containment (no radius).
export const ADDRESS_MAX_DISTANCE_M = intEnv('ADDRESS_MAX_DISTANCE_M', 30);
export const STREET_MAX_DISTANCE_M = intEnv('STREET_MAX_DISTANCE_M', 50);

// Historical↔contemporary boundary for point sources (address adamlink↔bag): a range
// reaching before this is adamlink-era, on/after it is bag-era. Domain anchor (WWII).
export const ERA_CUTOFF = dateEnv('ERA_CUTOFF', '1943-01-01');

// Present-day reference: a current place.name is treated as valid around here, so it
// wins for modern ranges and loses to a nearer historical observation for old ones.
export const CURRENT_ANCHOR = dateEnv('CURRENT_ANCHOR', '2020-01-01');
