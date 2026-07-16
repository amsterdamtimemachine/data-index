import { sql, type SQL } from 'drizzle-orm';
import { BASE_BIN_SIZE } from '@atm/shared';
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
 * BASE_BIN_SIZE, which normaliseBinSize guarantees.
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
 */
export function gridColExpr(gridCols: number, maxX: number): SQL {
  return sql`LEAST(FLOOR(${cellFeatures.cellX}::numeric * ${gridCols} / ${maxX + 1})::int, ${gridCols - 1})`;
}
export function gridRowExpr(gridRows: number, maxY: number): SQL {
  return sql`LEAST(FLOOR(${cellFeatures.cellY}::numeric * ${gridRows} / ${maxY + 1})::int, ${gridRows - 1})`;
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
 * boundary, because binSize is a multiple of BASE_BIN_SIZE.
 */
export function binWindow(fromYear: number, toYear: number): SQL {
  return sql`${cellFeatures.timeBin} >= ${fromYear} AND ${cellFeatures.timeBin} < ${toYear}`;
}

export { BASE_BIN_SIZE };
