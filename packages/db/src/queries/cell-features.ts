import { sql, type SQL } from 'drizzle-orm';
import { PRECOMP_TIME_BIN_YEARS } from '@atm/shared';
import { cellFeatures } from '../schema';
import { andIn } from './filters';

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

/** Restrict cell_features buckets to the cells a place covers. */
export function placeCellsCondition(placeId: string): SQL {
  return sql`(${cellFeatures.cellX}, ${cellFeatures.cellY}) IN (
    SELECT cell_x, cell_y FROM place_cells WHERE place_id = ${placeId})`;
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
