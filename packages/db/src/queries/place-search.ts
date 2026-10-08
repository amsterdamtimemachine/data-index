/** Name search over the gazetteer: current and historical place names. */
import { sql, type SQL } from 'drizzle-orm';
import type { PlaceSearchMatch, PlaceType, PlaceSource } from '@atm/shared';
import { DISPLAY_GRID_DEFAULT_COLS } from '@atm/shared';
import { db } from '../client';
import { displayGrid, gridColExpr, gridRowExpr } from './cell-features';

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;
const MAX_RESULTS = 20;

// exact name matches first, then a timeline: rows still current, youngest first;
// then ended rows, latest end first; then undated rows. Finest granularity and the
// name only break ties; whether a place has features plays no part
const SEARCH_ORDER = sql`exact_match DESC,
  CASE WHEN sort_until IS NOT NULL THEN 1 WHEN sort_since IS NOT NULL THEN 0 ELSE 2 END,
  sort_until DESC, sort_since DESC,
  CASE type WHEN 'address' THEN 0 WHEN 'street' THEN 1 WHEN 'neighbourhood' THEN 2 ELSE 3 END,
  lower(matched_name), id`;

export type PlaceSearchOptions = {
  limit?: number;
  /** Display grid width; cells in results use this resolution. */
  cols?: number;
};

export type PlaceByIdOptions = PlaceSearchOptions & {
  /** place_historical_name row the selection was made through; restores the
   * clicked alias and its window. Ignored unless the row belongs to the place. */
  nameId?: string;
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
  matched_name_id: string | null;
  geometry_since: string | null;
  geometry_until: string | null;
  feature_count: string;
  cells: number[] | null;
};

// The place's cells folded onto the display grid — the same partition the heatmap
// uses, so these indices land exactly on heatmap cells.
async function displayCellsExpr(cols: number): Promise<SQL> {
  const grid = await displayGrid(cols);
  const col = gridColExpr(sql`pc.cell_x`, grid.gridCols, grid.maxCellX);
  const row = gridRowExpr(sql`pc.cell_y`, grid.gridRows, grid.maxCellY);
  return sql`(
    SELECT json_agg(DISTINCT idx ORDER BY idx) FROM (
      SELECT (${row} * ${grid.gridCols} + ${col}) AS idx
      FROM place_cells pc WHERE pc.place_id = page.id
    ) folded
  )`;
}

function toMatch(row: SearchRow): PlaceSearchMatch {
  // an alias is a historical row without dates: no window, so a dated geometry's
  // window can still show for it
  let matchedWindow: [string | null, string | null] | null = null;
  if (row.matched_historical && (row.matched_since || row.matched_until)) {
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
    matchedNameId: row.matched_name_id,
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
             FALSE AS matched_historical,
             NULL::text AS matched_name_id
      FROM place p
      WHERE lower(p.name) LIKE ${prefix}
        AND (p.type <> 'address' OR ${withAddresses})
      UNION ALL
      SELECT p.id, p.name, p.type, p.source,
             h.name AS matched_name, h.since, h.until, TRUE, h.id
      FROM place_historical_name h
      JOIN place p ON p.id = h.place_id
      WHERE lower(h.name) LIKE ${prefix}
        AND (p.type <> 'address' OR ${withAddresses})
    ),
    -- one row per place: a current-name match outranks a historical one; among
    -- historical names the most recent window wins, and among undated aliases the
    -- exact, then the shortest, match
    deduped AS (
      SELECT DISTINCT ON (id) * FROM matches
      ORDER BY id, matched_historical, matched_since DESC NULLS LAST,
        (lower(matched_name) = ${lowered}) DESC, length(matched_name)
    ),
    -- sort_since/until: the row's place on the timeline. A dated historical name
    -- sorts on its own window; an undated variant sorts with its place, so a variant
    -- of a living street ranks as current even though it displays no date
    ranked AS (
      SELECT d.*,
        (lower(d.matched_name) = ${lowered}) AS exact_match,
        pg.since AS geometry_since, pg.until AS geometry_until,
        CASE WHEN d.matched_since IS NOT NULL OR d.matched_until IS NOT NULL
          THEN d.matched_since ELSE pg.since END AS sort_since,
        CASE WHEN d.matched_since IS NOT NULL OR d.matched_until IS NOT NULL
          THEN d.matched_until ELSE pg.until END AS sort_until
      FROM deduped d
      LEFT JOIN place_geometry pg ON pg.place_id = d.id
    ),
    page AS (
      SELECT * FROM ranked ORDER BY ${SEARCH_ORDER} LIMIT ${limit}
    )
    SELECT page.id, page.name, page.type, page.source,
      page.matched_name, page.matched_since::text, page.matched_until::text,
      page.matched_historical, page.matched_name_id,
      page.geometry_since::text, page.geometry_until::text,
      (SELECT COUNT(*) FROM feature_to_place fp WHERE fp.place_id = page.id) AS feature_count,
      ${cells} AS cells
    FROM page
    ORDER BY ${SEARCH_ORDER}
  `);

  return result.rows.map(toMatch);
}

/** Fetch one place by id (URL restore). Same shape as a search match; a nameId
 * restores the clicked alias and its window. */
export async function getPlaceById(placeId: string, options: PlaceByIdOptions = {}): Promise<PlaceSearchMatch | null> {
  const cells = await displayCellsExpr(options.cols ?? DISPLAY_GRID_DEFAULT_COLS);
  let nameId: string | null = null;
  if (options.nameId) {
    nameId = options.nameId;
  }

  const result = await db.execute<SearchRow>(sql`
    SELECT page.id, page.name, page.type, page.source,
      COALESCE(h.name, page.name) AS matched_name,
      h.since::text AS matched_since, h.until::text AS matched_until,
      (h.id IS NOT NULL) AS matched_historical,
      h.id AS matched_name_id,
      pg.since::text AS geometry_since, pg.until::text AS geometry_until,
      (SELECT COUNT(*) FROM feature_to_place fp WHERE fp.place_id = page.id) AS feature_count,
      ${cells} AS cells
    FROM place page
    LEFT JOIN place_historical_name h ON h.id = ${nameId} AND h.place_id = page.id
    LEFT JOIN place_geometry pg ON pg.place_id = page.id
    WHERE page.id = ${placeId}
  `);

  if (result.rows.length === 0) {
    return null;
  }
  return toMatch(result.rows[0]);
}
