/**
 * Feature → place candidate fetchers + selection helpers — the resolution core used
 * by the point/name resolvers in `place-inference.ts`. Read-only server-side ETL;
 * each fetcher takes the feature date RANGE [start, end] (single day = start == end)
 * and returns a candidate POOL that the selection helpers turn into one linked place.
 *
 * Reads place / place_geometry / place_historical_name; geometry RD/28992. Point WKT
 * defaults to WGS84 (srid 4326); pass srid=28992 for RD (passes through untransformed).
 * The point fetcher rides the GiST index; the name fetcher needs the btree lower(name)
 * expression indexes on place and place_historical_name.
 */
import { db } from '../../client';
import { sql } from 'drizzle-orm/sql';
import { ADDRESS_MAX_DISTANCE_M, STREET_MAX_DISTANCE_M, ERA_CUTOFF, CURRENT_ANCHOR } from '@atm/shared';

export type PlaceType = 'address' | 'street' | 'neighbourhood' | 'district';
export type PlaceSource = 'adamlink' | 'bag' | 'nwb' | 'cbs';

// address > street > neighbourhood > district — the finest-first priority
export const GRANULARITIES: PlaceType[] = ['address', 'street', 'neighbourhood', 'district'];

// ── tuning knobs ──────────────────────────────────────────────────────────────
// ERA_CUTOFF (historical↔current address cut) and CURRENT_ANCHOR (present-day reference
// for current-name scoring) are env-configurable via @atm/shared; re-exported here.
export { ERA_CUTOFF, CURRENT_ANCHOR };
// Defensive sentinel gap: a both-open historical name (since AND until null) scores
// larger than any real gap, so it never wins unconditionally (spec req 11). Not a knob —
// any large value works; kept a literal so it can't be misconfigured to a small one.
export const BOTH_OPEN_GAP_DAYS = 100_000_000;

// Proximity caps (metres, RD/28992) — env-configurable via @atm/shared (defaults 30/50);
// re-exported here. Areas match by containment, so they have no radius.
export { ADDRESS_MAX_DISTANCE_M, STREET_MAX_DISTANCE_M };
export const MAX_DISTANCE_M: Record<PlaceType, number | null> = {
  address: ADDRESS_MAX_DISTANCE_M, street: STREET_MAX_DISTANCE_M, neighbourhood: null, district: null,
};
// Widest per-type cap; constant keeps ST_DWithin index-usable (exact cap is a post-filter).
export const MAX_POINT_CAP_M = Math.max(ADDRESS_MAX_DISTANCE_M, STREET_MAX_DISTANCE_M);

export interface Candidate {
  placeId: string; name: string | null; type: PlaceType; source: PlaceSource;
  distanceM: number; overlapDays: number | null; eraFit: boolean; dated: boolean;
}

export interface NameCandidate {
  placeId: string; name: string | null; type: PlaceType; source: PlaceSource;
  via: 'current' | 'historical'; gapDays: number;
}

// ══ FETCHERS ══════════════════════════════════════════════════════════════════

// ── POINT signal: nearest address/street per source within cap + containing areas ──
// Address era-fit is OVERLAP-based: adamlink if the range reaches before ERA_CUTOFF,
// bag if it reaches on/after it — a range straddling 1943 surfaces both, distance decides.
// Area era-fit is [start,end] ⋂ [since,until); overlap length ranks among containers.
export async function getCandidatesByPoint(wkt: string, start: string, end: string, srid = 4326): Promise<Candidate[]> {
  const rows = await db.execute<{
    place_id: string; name: string | null; type: PlaceType; source: PlaceSource;
    dist: number; overlap_days: number | null; era_fit: boolean; dated: boolean;
  }>(sql`
    WITH q AS (SELECT ST_Transform(ST_GeomFromText(${wkt}, ${srid}::int), 28992) AS g),
    near AS (
      SELECT DISTINCT ON (p.type, p.source)
             p.id, p.name, p.type, p.source, ST_Distance(pg.geometry, q.g) AS dist
      FROM q, place_geometry pg JOIN place p ON p.id = pg.place_id
      WHERE p.type IN ('address', 'street')
        AND ST_DWithin(pg.geometry, q.g, ${MAX_POINT_CAP_M}::float8)
        AND ST_Distance(pg.geometry, q.g) <=
              CASE p.type WHEN 'address' THEN ${ADDRESS_MAX_DISTANCE_M}::float8 ELSE ${STREET_MAX_DISTANCE_M}::float8 END
      ORDER BY p.type, p.source, pg.geometry <-> q.g
    ),
    area AS (
      SELECT p.id, p.name, p.type, p.source, pg.since, pg.until
      FROM q, place_geometry pg JOIN place p ON p.id = pg.place_id
      WHERE p.type IN ('neighbourhood', 'district') AND ST_Intersects(pg.geometry, q.g)
    )
    SELECT id AS place_id, name, type, source, dist, NULL::int AS overlap_days,
           CASE type
             WHEN 'address' THEN CASE source
                                   WHEN 'adamlink' THEN ${start}::date < ${ERA_CUTOFF}::date
                                   WHEN 'bag'      THEN ${end}::date >= ${ERA_CUTOFF}::date
                                   ELSE false END
             WHEN 'street'  THEN source = 'adamlink'
           END AS era_fit,
           FALSE AS dated
    FROM near
    UNION ALL
    SELECT id, name, type, source, 0::float AS dist,
           GREATEST(0, LEAST(${end}::date, COALESCE(until, 'infinity'::date))
                       - GREATEST(${start}::date, COALESCE(since, '-infinity'::date)))::int AS overlap_days,
           ((since IS NULL OR since <= ${end}::date) AND (until IS NULL OR until > ${start}::date)) AS era_fit,
           (since IS NOT NULL OR until IS NOT NULL) AS dated
    FROM area
  `);
  return rows.rows.map((r) => ({
    placeId: r.place_id, name: r.name, type: r.type, source: r.source,
    distanceM: Number(r.dist), overlapDays: r.overlap_days === null ? null : Number(r.overlap_days),
    eraFit: r.era_fit, dated: r.dated,
  }));
}

// ── NAME signal: match current + dated historical names; nearest-by-overlap wins ──
// gap = 0 if the feature range [start,end] overlaps the name window [since,until) — until
// is EXCLUSIVE, matching place_geometry (a rename's until = successor's since is a clean
// handoff). Else the days to the nearest end (GREATEST skips NULL open ends automatically).
export async function getCandidatesByName(name: string, start: string, end: string): Promise<NameCandidate[]> {
  const rows = await db.execute<{
    place_id: string; name: string | null; type: PlaceType;
    source: PlaceSource; via: 'current' | 'historical'; gap_days: number;
  }>(sql`
    WITH cand AS (
      SELECT p.id, p.name, p.type, p.source, 'current' AS via, NULL::date AS since, NULL::date AS until
      FROM place p WHERE LOWER(p.name) = LOWER(${name})
      UNION ALL
      SELECT p.id, hn.name, p.type, p.source, 'historical' AS via, hn.since, hn.until
      FROM place_historical_name hn JOIN place p ON p.id = hn.place_id
      WHERE LOWER(hn.name) = LOWER(${name})
    ),
    scored AS (
      SELECT id, name, type, source, via,
             CASE
               WHEN via = 'current'
                 THEN GREATEST(${start}::date - ${CURRENT_ANCHOR}::date, ${CURRENT_ANCHOR}::date - ${end}::date, 0)
               WHEN since IS NULL AND until IS NULL
                 THEN ${BOTH_OPEN_GAP_DAYS}
               ELSE GREATEST(since - ${end}::date, ${start}::date - (until - 1), 0)
             END AS gap_days
      FROM cand
    )
    SELECT DISTINCT ON (id) id AS place_id, name, type, source, via, gap_days
    FROM scored
    ORDER BY id, gap_days   -- keep each place's nearest-in-time observation
  `);
  return rows.rows.map((r) => ({
    placeId: r.place_id, name: r.name, type: r.type,
    source: r.source, via: r.via, gapDays: Number(r.gap_days),
  }));
}

// ══ SELECTION HELPERS ═════════════════════════════════════════════════════════
// (turn a pool into resolved links — the resolver layer wires these together)

// point-pool comparator: era-fit first, then longest overlap (areas) or nearest distance
export const rank = (a: Candidate, b: Candidate) =>
  Number(b.eraFit) - Number(a.eraFit)
  || (a.overlapDays != null && b.overlapDays != null
        ? (b.overlapDays - a.overlapDays) || (Number(b.dated) - Number(a.dated))
        : a.distanceM - b.distanceM);

// finest granularity present in `best`, following the address>street>… priority
export function finestResolvable(best: Partial<Record<PlaceType, unknown>>): PlaceType | undefined {
  return GRANULARITIES.find((t) => best[t]);
}

// Name-pool selection (req 13): unique top by gap → finest type. Empty pool → none;
// a top-two tie on (gap, type) is ambiguous (e.g. Amsterdam + Weesp Kerkstraat) → skip.
export type NameResolution =
  | { kind: 'resolved'; winner: NameCandidate }
  | { kind: 'ambiguous'; tied: NameCandidate[] }
  | { kind: 'none' };

export function resolveNamePool(pool: NameCandidate[]): NameResolution {
  if (pool.length === 0) return { kind: 'none' };
  const sorted = [...pool].sort((a, b) =>
    a.gapDays - b.gapDays || GRANULARITIES.indexOf(a.type) - GRANULARITIES.indexOf(b.type));
  const top = sorted[0];
  const tied = sorted.filter((c) => c.gapDays === top.gapDays && c.type === top.type);
  return tied.length > 1 ? { kind: 'ambiguous', tied } : { kind: 'resolved', winner: top };
}

// ── point-pool → the single most-specific place to link (spec req 15), or undefined ──
// gathers the best candidate per granularity within its cap, then returns the finest.
export function pickFinest(pool: Candidate[]): Candidate | undefined {
  const best: Partial<Record<PlaceType, Candidate>> = {};
  for (const t of GRANULARITIES) {
    const cap = MAX_DISTANCE_M[t];
    best[t] = pool.filter((c) => c.type === t && (cap === null || c.distanceM <= cap)).sort(rank)[0];
  }
  const type = finestResolvable(best);
  return type ? best[type] : undefined;
}
