import { sql, type SQL } from 'drizzle-orm';
import { PRECOMP_TIME_BIN_YEARS, DISPLAY_GRID_DEFAULT_COLS } from '@atm/shared';
import { cellFeatures } from '../schema';
import { db } from '../client';
import { andIn } from './filters';
import { getGridConfig } from './grid-config';

/**
 * Shared pieces of every cell_features read. getHeatmap, getHeatmapTimeline and
 * getHistogram all aggregate the same buckets — only the GROUP BY differs — so the
 * filter and roll-up expressions live here rather than being re-inlined three times.
 * That is exactly how the temporal window semantics drifted before (see
 * time-filter.ts), and the counts have to agree across all three.
 */

/** Exact distinct feature count for a group of buckets. Union dedupes a feature that spans them. */
export const countExpr = sql`rb_cardinality(rb_or_agg(${cellFeatures.featureIds}))`;

/**
 * countExpr, optionally intersected with a search bitmap (see feature-search.ts):
 * the distinct features of the group that also match the search. NULL-safe — an
 * empty search set (NULL bitmap) collapses every count to 0, which is exactly the
 * zero-results semantics a no-match query should render.
 */
export function countMatchesExpr(searchBm: SQL | null): SQL {
  if (!searchBm) {
    return countExpr;
  }
  return sql`COALESCE(rb_and_cardinality(rb_or_agg(${cellFeatures.featureIds}), ${searchBm}), 0)`;
}

/**
 * Fold a base bin into its display bin. Both are anchored to round multiples of
 * their size (generateTimeSlices floors slice starts), so integer division lands a
 * base bin in the display bin that contains it — provided binSize is a multiple of
 * PRECOMP_TIME_BIN_YEARS, which normaliseBinSize guarantees.
 *
 * Parenthesised so callers can append a cast: `::` binds tighter than `*`, so an
 * unwrapped expression would cast only the trailing operand.
 */
export function displayBinExpr(binSizeYears: number): SQL {
  return sql`((${cellFeatures.timeBin} / ${binSizeYears}::int) * ${binSizeYears}::int)`;
}

/**
 * Base cell -> display grid cell. Mirrors the forward partition the live query used
 * against place_cells, so getFeatures' inverse still lines up with these counts.
 * Takes the cell column as SQL so heatmap (cell_features) and place search
 * (place_cells) fold with the one formula.
 */
export function gridColExpr(cellCol: SQL, gridCols: number, maxX: number): SQL {
  return sql`LEAST(FLOOR(${cellCol}::numeric * ${gridCols} / ${maxX + 1})::int, ${gridCols - 1})`;
}
export function gridRowExpr(cellRow: SQL, gridRows: number, maxY: number): SQL {
  return sql`LEAST(FLOOR(${cellRow}::numeric * ${gridRows} / ${maxY + 1})::int, ${gridRows - 1})`;
}

/**
 * Derive the display grid from a width (cols) only. Rows follow the data's
 * aspect ratio — (maxCellY+1)/(maxCellX+1) — so each display cell is square in RD
 * metres (and, since Web Mercator is conformal, square on screen). Both axes are
 * capped at the base-cell resolution.
 */
export function deriveGrid(cols: number, maxCellX: number, maxCellY: number): { gridCols: number; gridRows: number } {
  const gridCols = Math.min(cols, maxCellX + 1);
  const gridRows = Math.min(
    Math.max(1, Math.round((gridCols * (maxCellY + 1)) / (maxCellX + 1))),
    maxCellY + 1
  );
  return { gridCols, gridRows };
}

/** The display grid a request folds base cells into, with the base extent it partitions. */
export type DisplayGrid = { gridCols: number; gridRows: number; maxCellX: number; maxCellY: number };

export async function displayGrid(cols: number = DISPLAY_GRID_DEFAULT_COLS): Promise<DisplayGrid> {
  const cfg = await getGridConfig();
  const { gridCols, gridRows } = deriveGrid(cols, cfg.maxCellX, cfg.maxCellY);
  return { gridCols, gridRows, maxCellX: cfg.maxCellX, maxCellY: cfg.maxCellY };
}

export type BaseCellRange = { minCellX: number; maxCellX: number; minCellY: number; maxCellY: number };

/**
 * Inverse of gridColExpr/gridRowExpr: the base cells one display cell covers. A
 * base index i folds to floor(i * grid / extent), so display index d holds every i
 * from ceil(d * extent / grid) up to ceil((d + 1) * extent / grid) - 1.
 */
export function displayCellBaseRange(col: number, row: number, grid: DisplayGrid): BaseCellRange {
  const spanX = grid.maxCellX + 1;
  const spanY = grid.maxCellY + 1;
  return {
    minCellX: Math.max(Math.ceil((col * spanX) / grid.gridCols), 0),
    maxCellX: Math.min(Math.ceil(((col + 1) * spanX) / grid.gridCols) - 1, grid.maxCellX),
    minCellY: Math.max(Math.ceil((row * spanY) / grid.gridRows), 0),
    maxCellY: Math.min(Math.ceil(((row + 1) * spanY) / grid.gridRows) - 1, grid.maxCellY)
  };
}

type DisplayCellRow = { dc: number; dr: number };

/**
 * Restrict rows to the base cells inside the display cells a place lies in: the
 * cells the map outlines for it, so a selected place reads like clicking those
 * cells. The cell set is computed here and bound as two integer arrays, so the
 * planner sees its exact size and joins it against the cell indexes; generating
 * it in SQL made the planner guess millions of rows and scan place_cells instead.
 * Takes the cell columns as SQL so cell_features (histogram) and place_cells
 * (features spine) share the fragment.
 */
export async function placeCellsCondition(cellX: SQL, cellY: SQL, placeId: string, grid: DisplayGrid): Promise<SQL> {
  const result = await db.execute<DisplayCellRow>(sql`
    SELECT DISTINCT ${gridColExpr(sql`cell_x`, grid.gridCols, grid.maxCellX)} AS dc,
                    ${gridRowExpr(sql`cell_y`, grid.gridRows, grid.maxCellY)} AS dr
    FROM place_cells WHERE place_id = ${placeId}`);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const d of result.rows) {
    const r = displayCellBaseRange(d.dc, d.dr, grid);
    for (let x = r.minCellX; x <= r.maxCellX; x++) {
      for (let y = r.minCellY; y <= r.maxCellY; y++) {
        xs.push(x);
        ys.push(y);
      }
    }
  }
  if (xs.length === 0) {
    return sql`FALSE`;
  }
  return sql`(${cellX}, ${cellY}) IN (
    SELECT x, y FROM unnest(${sql.param(xs)}::int[], ${sql.param(ys)}::int[]) AS c(x, y))`;
}

/**
 * The category filters, as a WHERE body. recordTypes is required (an empty list
 * means no data and callers short-circuit before reaching here); datasets and
 * placeTypes are optional.
 */
export function categoryFilter(
  recordTypes: string[],
  datasetIds?: string[],
  placeTypes?: string[]
): SQL {
  return sql`${cellFeatures.recordType} IN ${recordTypes}
    ${andIn(sql`${cellFeatures.datasetId}`, datasetIds)}
    ${andIn(sql`${cellFeatures.placeType}`, placeTypes)}`;
}

/**
 * Restrict to the base bins covered by the half-open display window [fromYear, toYear).
 * A base bin belongs to the window iff its start does — bins never straddle a display
 * boundary, because binSize is a multiple of PRECOMP_TIME_BIN_YEARS.
 */
export function binWindow(fromYear: number, toYear: number): SQL {
  return sql`${cellFeatures.timeBin} >= ${fromYear} AND ${cellFeatures.timeBin} < ${toYear}`;
}

/**
 * Restrict to a base-cell range — the predicate getFeatures applies to place_cells
 * and a cell-scoped histogram applies to cell_features. One definition so "this
 * cell" can never mean different base cells to the feature list and the timeline.
 * Callers pass their own column refs (aliased or schema-qualified).
 */
export function cellRangeCondition(
  xCol: SQL,
  yCol: SQL,
  range: { minCellX: number; maxCellX: number; minCellY: number; maxCellY: number }
): SQL {
  return sql`${xCol} BETWEEN ${range.minCellX} AND ${range.maxCellX}
    AND ${yCol} BETWEEN ${range.minCellY} AND ${range.maxCellY}`;
}

export { PRECOMP_TIME_BIN_YEARS };
