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
import { sql, type SQL } from 'drizzle-orm/sql';
import { ADDRESS_MAX_DISTANCE_M, STREET_MAX_DISTANCE_M, ERA_CUTOFF, CURRENT_ANCHOR, type PlaceType, type PlaceSource } from '@atm/shared';
import { wktToRd, houseNumber } from '../sql';

export type { PlaceType, PlaceSource };

// address > street > neighbourhood > district — the finest-first priority
export const GRANULARITIES: PlaceType[] = ['address', 'street', 'neighbourhood', 'district'];

// ── tuning knobs ──────────────────────────────────────────────────────────────
// ERA_CUTOFF (historical↔current address cut) and CURRENT_ANCHOR (present-day reference
// for current-name scoring) are env-configurable via @atm/shared; re-exported here.
export { ERA_CUTOFF, CURRENT_ANCHOR };

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
  via: 'current' | 'historical'; gapDays: number; eraFit: boolean;
}

// ── temporal terms (the spec §4 vocabulary) — each reads the surrounding row's
// since/until (and via), so they compose only inside the fetcher queries below ──

// [since, until) overlaps the feature range [start, end]; until is EXCLUSIVE,
// matching place_geometry (a rename's until = successor's since is a clean handoff).
const windowOverlaps = (start: string, end: string) =>
  sql`((since IS NULL OR since <= ${end}::date) AND (until IS NULL OR until > ${start}::date))`;

// Days of overlap between the feature range and [since, until), clamped at 0 —
// ranks containing areas by how much of the range their vintage covers.
const overlapDays = (start: string, end: string) =>
  sql`GREATEST(0, LEAST(${end}::date, COALESCE(until, 'infinity'::date))
              - GREATEST(${start}::date, COALESCE(since, '-infinity'::date)))::int`;

// Gap from the feature range to a name observation: 0 on overlap, else days to the
// nearest window end. Current names (no window) anchor at CURRENT_ANCHOR. Historical
// rows without any period are labels, not observations, and never reach here.
const nameGapDays = (start: string, end: string) => sql`CASE
  WHEN via = 'current' THEN GREATEST(${start}::date - ${CURRENT_ANCHOR}::date, ${CURRENT_ANCHOR}::date - ${end}::date, 0)
  ELSE GREATEST(since - ${end}::date, ${start}::date - (until - 1), 0)
END`;

// An address register covers the feature range: adamlink reaches before ERA_CUTOFF,
// bag on/after it; a range straddling the cut fits both. Reads the row's source.
const addressEraFit = (start: string, end: string) => sql`CASE source
  WHEN 'adamlink' THEN ${start}::date < ${ERA_CUTOFF}::date
  WHEN 'bag'      THEN ${end}::date >= ${ERA_CUTOFF}::date
  ELSE false END`;

// ══ FETCHERS ══════════════════════════════════════════════════════════════════

// ── POINT signal: every address/street within cap, nearest first, + containing areas ──
// Address era-fit is OVERLAP-based: adamlink if the range reaches before ERA_CUTOFF,
// bag if it reaches on/after it — a range straddling 1943 surfaces both, distance decides.
// Area era-fit is [start,end] ⋂ [since,until); overlap length ranks among containers.
export async function getCandidatesByPoint(wkt: string, start: string, end: string, srid = 4326): Promise<Candidate[]> {
  const rows = await db.execute<{
    place_id: string; name: string | null; type: PlaceType; source: PlaceSource;
    dist: number; overlap_days: number | null; era_fit: boolean; dated: boolean;
  }>(sql`
    WITH q AS (SELECT ${wktToRd(wkt, srid)} AS g),
    near AS (
      SELECT p.id, p.name, p.type, p.source, ST_Distance(pg.geometry, q.g) AS dist
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
             WHEN 'address' THEN ${addressEraFit(start, end)}
             WHEN 'street'  THEN source = 'adamlink'
           END AS era_fit,
           FALSE AS dated
    FROM near
    UNION ALL
    SELECT id, name, type, source, 0::float AS dist,
           ${overlapDays(start, end)} AS overlap_days,
           ${windowOverlaps(start, end)} AS era_fit,
           (since IS NOT NULL OR until IS NOT NULL) AS dated
    FROM area
  `);
  return rows.rows.map((r) => ({
    placeId: r.place_id, name: r.name, type: r.type, source: r.source,
    distanceM: Number(r.dist), overlapDays: r.overlap_days === null ? null : Number(r.overlap_days),
    eraFit: r.era_fit, dated: r.dated,
  }));
}

// ── NAME signal: match current + dated historical names; nearest-by-overlap wins.
// An undated historical row is a label (an alias), not an observation: skipped. ──
// gap = 0 if the feature range [start,end] overlaps the name window [since,until) — until
// is EXCLUSIVE, matching place_geometry (a rename's until = successor's since is a clean
// handoff). Else the days to the nearest end (GREATEST skips NULL open ends automatically).
export async function getCandidatesByName(name: string, start: string, end: string): Promise<NameCandidate[]> {
  const rows = await db.execute<{
    place_id: string; name: string | null; type: PlaceType;
    source: PlaceSource; via: 'current' | 'historical'; gap_days: number; era_fit: boolean;
  }>(sql`
    WITH cand AS (
      SELECT p.id, p.name, p.type, p.source, 'current' AS via, NULL::date AS since, NULL::date AS until
      FROM place p WHERE LOWER(p.name) = LOWER(${name})
      UNION ALL
      SELECT p.id, hn.name, p.type, p.source, 'historical' AS via, hn.since, hn.until
      FROM place_historical_name hn JOIN place p ON p.id = hn.place_id
      WHERE LOWER(hn.name) = LOWER(${name})
        AND (hn.since IS NOT NULL OR hn.until IS NOT NULL)
    ),
    scored AS (
      SELECT id, name, type, source, via,
             ${nameGapDays(start, end)} AS gap_days,
             CASE WHEN type = 'address' THEN ${addressEraFit(start, end)} ELSE TRUE END AS era_fit
      FROM cand
    )
    SELECT DISTINCT ON (id) id AS place_id, name, type, source, via, gap_days, era_fit
    FROM scored
    ORDER BY id, gap_days   -- keep each place's nearest-in-time observation
  `);
  return rows.rows.map((r) => ({
    placeId: r.place_id, name: r.name, type: r.type,
    source: r.source, via: r.via, gapDays: Number(r.gap_days), eraFit: r.era_fit,
  }));
}

export interface Twin {
  placeId: string;
  // the twin has gone by a name the place itself has had
  sharesName: boolean;
  // days from the feature range to the twin's nearest name record; null without a dated one
  gapDays: number | null;
}

/**
 * The same address as the other source records it: every address in the same BAG
 * building, as both sources state it, with the same house designation. Several when
 * one building has that number on two streets, when Adamlink keeps a point per
 * register, or when BAG holds a unit in use and one formed; sharesName and gapDays
 * tell them apart.
 */
export async function twinOf(placeId: string, start: string, end: string): Promise<Twin[]> {
  const rows = await db.execute<{ id: string; shares_name: boolean; gap_days: number | null }>(sql`
    WITH me AS (
      SELECT p.id, p.source, pg.building_id, ${houseNumber(sql`p.name`)} AS house
      FROM place p JOIN place_geometry pg ON pg.place_id = p.id
      WHERE p.id = ${placeId} AND p.type = 'address'
    ),
    my_names AS (
      SELECT LOWER(p.name) AS n FROM place p WHERE p.id = ${placeId} AND p.name IS NOT NULL
      UNION
      SELECT LOWER(hn.name) FROM place_historical_name hn WHERE hn.place_id = ${placeId} AND hn.name IS NOT NULL
    ),
    cand AS (
      SELECT o.id, o.name
      FROM me
      JOIN place_geometry og ON og.building_id = me.building_id AND og.place_id <> me.id
      JOIN place o ON o.id = og.place_id
      WHERE o.type = 'address' AND o.source <> me.source
        AND ${houseNumber(sql`o.name`)} = me.house
    ),
    cand_names AS (
      SELECT c.id, LOWER(c.name) AS n, 'current' AS via, NULL::date AS since, NULL::date AS until
      FROM cand c WHERE c.name IS NOT NULL
      UNION ALL
      SELECT c.id, LOWER(hn.name), 'historical', hn.since, hn.until
      FROM cand c JOIN place_historical_name hn ON hn.place_id = c.id WHERE hn.name IS NOT NULL
    ),
    -- an undated historical row is a label, not an observation: no gap
    scored AS (
      SELECT id, n,
             CASE WHEN via = 'historical' AND since IS NULL AND until IS NULL THEN NULL
                  ELSE ${nameGapDays(start, end)} END AS gap
      FROM cand_names
    )
    SELECT c.id,
           EXISTS (SELECT 1 FROM scored s JOIN my_names m ON m.n = s.n WHERE s.id = c.id) AS shares_name,
           (SELECT MIN(s.gap) FROM scored s WHERE s.id = c.id) AS gap_days
    FROM cand c
    ORDER BY c.id
  `);
  return rows.rows.map((r) => ({
    placeId: r.id, sharesName: r.shares_name,
    gapDays: r.gap_days === null ? null : Number(r.gap_days),
  }));
}

// ── every name a place has gone by: the current one and each historical row, dated or not ──
export async function getNamesForPlaces(placeIds: string[]): Promise<Map<string, string[]>> {
  const names = new Map<string, string[]>();
  if (placeIds.length === 0) return names;
  const rows = await db.execute<{ place_id: string; name: string }>(sql`
    SELECT p.id AS place_id, p.name
    FROM place p WHERE p.id IN ${placeIds} AND p.name IS NOT NULL
    UNION
    SELECT hn.place_id, hn.name
    FROM place_historical_name hn WHERE hn.place_id IN ${placeIds} AND hn.name IS NOT NULL
  `);
  for (const r of rows.rows) {
    const list = names.get(r.place_id) ?? [];
    list.push(r.name);
    names.set(r.place_id, list);
  }
  return names;
}

// ══ SELECTION HELPERS ═════════════════════════════════════════════════════════
// (turn a pool into resolved links — the resolver layer wires these together)

// point-pool comparator: era-fit first, then longest overlap (areas) or nearest distance
export function rank(a: Candidate, b: Candidate): number {
  if (a.eraFit !== b.eraFit) {
    return Number(b.eraFit) - Number(a.eraFit);
  }
  if (a.overlapDays === null || b.overlapDays === null) {
    return a.distanceM - b.distanceM;
  }
  if (a.overlapDays !== b.overlapDays) {
    return b.overlapDays - a.overlapDays;
  }
  return Number(b.dated) - Number(a.dated);
}

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
  const sorted = [...pool].sort((a, b) => {
    if (a.gapDays !== b.gapDays) {
      return a.gapDays - b.gapDays;
    }
    return GRANULARITIES.indexOf(a.type) - GRANULARITIES.indexOf(b.type);
  });
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
