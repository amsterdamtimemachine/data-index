/** Name search over the gazetteer: current and historical place names. */
import { sql, type SQL } from 'drizzle-orm';
import type { PlaceSearchMatch, PlaceType, PlaceSource } from '@atm/shared';
import { DISPLAY_GRID_DEFAULT_COLS } from '@atm/shared';
import { db } from '../client';
import { getGridConfig } from './grid-config';
import { deriveGrid, gridColExpr, gridRowExpr } from './cell-features';

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;
const MAX_RESULTS = 20;

// data-bearing places first, then exact name matches, then finest granularity
const SEARCH_ORDER = sql`has_features DESC, exact_match DESC,
  CASE type WHEN 'address' THEN 0 WHEN 'street' THEN 1 WHEN 'neighbourhood' THEN 2 ELSE 3 END,
  lower(matched_name), id`;

export type PlaceSearchOptions = {
  limit?: number;
  /** Display grid width; cells in results use this resolution. */
  cols?: number;
};

type SearchRow = {
  id: string;
  name: string | null;
  type: PlaceType;
  source: PlaceSource | null;
  matched_name: string | null;
  matched_since: string | null;
  matched_until: string | null;
  matched_historical: boolean;
  geometry_since: string | null;
  geometry_until: string | null;
  feature_count: string;
  cells: number[] | null;
};

// The place's cells folded onto the display grid — the same partition the heatmap
// uses, so these indices land exactly on heatmap cells.
async function displayCellsExpr(cols: number): Promise<SQL> {
  const cfg = await getGridConfig();
  const { gridCols, gridRows } = deriveGrid(cols, cfg.maxCellX, cfg.maxCellY);
  const col = gridColExpr(sql`pc.cell_x`, gridCols, cfg.maxCellX);
  const row = gridRowExpr(sql`pc.cell_y`, gridRows, cfg.maxCellY);
  return sql`(
    SELECT json_agg(DISTINCT idx ORDER BY idx) FROM (
      SELECT (${row} * ${gridCols} + ${col}) AS idx
      FROM place_cells pc WHERE pc.place_id = page.id
    ) folded
  )`;
}

function toMatch(row: SearchRow): PlaceSearchMatch {
  let matchedWindow: [string | null, string | null] | null = null;
  if (row.matched_historical) {
    matchedWindow = [row.matched_since, row.matched_until];
  }
  let cells: number[] = [];
  if (row.cells) {
    cells = row.cells;
  }
  let matchedName = row.matched_name;
  if (matchedName === null) {
    matchedName = '';
  }
  let geometryWindow: [string | null, string | null] | null = null;
  if (row.geometry_since || row.geometry_until) {
    geometryWindow = [row.geometry_since, row.geometry_until];
  }
  return {
    placeId: row.id,
    name: row.name,
    type: row.type,
    source: row.source,
    matchedName,
    matchedWindow,
    geometryWindow,
    featureCount: parseInt(row.feature_count),
    cells
  };
}

export async function searchPlaces(query: string, options: PlaceSearchOptions = {}): Promise<PlaceSearchMatch[]> {
  const q = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (q.length < MIN_QUERY_LENGTH) {
    return [];
  }
  const limit = Math.min(Math.max(options.limit ?? 10, 1), MAX_RESULTS);
  const cells = await displayCellsExpr(options.cols ?? DISPLAY_GRID_DEFAULT_COLS);

  // escape LIKE wildcards so the query text is always a literal prefix
  const lowered = q.toLowerCase();
  const prefix = lowered.replace(/([\\%_])/g, '\\$1') + '%';

  // house numbers only once the query contains a digit (the Locatieserver
  // convention): a bare name means the street or area, not its 400 addresses
  const withAddresses = /\d/.test(q);

  const result = await db.execute<SearchRow>(sql`
    WITH matches AS (
      SELECT p.id, p.name, p.type, p.source,
             p.name AS matched_name,
             NULL::date AS matched_since, NULL::date AS matched_until,
             FALSE AS matched_historical
      FROM place p
      WHERE lower(p.name) LIKE ${prefix}
        AND (p.type <> 'address' OR ${withAddresses})
      UNION ALL
      SELECT p.id, p.name, p.type, p.source,
             h.name AS matched_name, h.since, h.until, TRUE
      FROM place_historical_name h
      JOIN place p ON p.id = h.place_id
      WHERE lower(h.name) LIKE ${prefix}
        AND (p.type <> 'address' OR ${withAddresses})
    ),
    -- one row per place: a current-name match outranks a historical one, and
    -- among historical names the most recent window wins
    deduped AS (
      SELECT DISTINCT ON (id) * FROM matches
      ORDER BY id, matched_historical, matched_since DESC NULLS LAST
    ),
    ranked AS (
      SELECT d.*,
        EXISTS (SELECT 1 FROM feature_to_place fp WHERE fp.place_id = d.id) AS has_features,
        (lower(d.matched_name) = ${lowered}) AS exact_match
      FROM deduped d
    ),
    page AS (
      SELECT * FROM ranked ORDER BY ${SEARCH_ORDER} LIMIT ${limit}
    )
    SELECT page.id, page.name, page.type, page.source,
      page.matched_name, page.matched_since::text, page.matched_until::text,
      page.matched_historical, page.has_features, page.exact_match,
      pg.since::text AS geometry_since, pg.until::text AS geometry_until,
      (SELECT COUNT(*) FROM feature_to_place fp WHERE fp.place_id = page.id) AS feature_count,
      ${cells} AS cells
    FROM page
    LEFT JOIN place_geometry pg ON pg.place_id = page.id
    ORDER BY ${SEARCH_ORDER}
  `);

  return result.rows.map(toMatch);
}

/** Fetch one place by id (URL restore). Same shape as a search match. */
export async function getPlaceById(placeId: string, options: PlaceSearchOptions = {}): Promise<PlaceSearchMatch | null> {
  const cells = await displayCellsExpr(options.cols ?? DISPLAY_GRID_DEFAULT_COLS);

  const result = await db.execute<SearchRow>(sql`
    SELECT page.id, page.name, page.type, page.source,
      page.name AS matched_name,
      NULL::text AS matched_since, NULL::text AS matched_until,
      FALSE AS matched_historical,
      pg.since::text AS geometry_since, pg.until::text AS geometry_until,
      (SELECT COUNT(*) FROM feature_to_place fp WHERE fp.place_id = page.id) AS feature_count,
      ${cells} AS cells
    FROM place page
    LEFT JOIN place_geometry pg ON pg.place_id = page.id
    WHERE page.id = ${placeId}
  `);

  if (result.rows.length === 0) {
    return null;
  }
  return toMatch(result.rows[0]);
}
