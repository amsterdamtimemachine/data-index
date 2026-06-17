import { sql, type SQL } from 'drizzle-orm';

/**
 * Half-open, year-based temporal overlap.
 *
 * A feature with date range [start, end] intersects the window [fromYear, toYear)
 * iff  year(start) < toYear  AND  year(end) >= fromYear.
 *
 * Single definition shared by getHeatmap, getHeatmapTimeline, getHistogram and
 * getFeatures. These used to each inline this predicate, which is exactly how the
 * window semantics drifted (one path was inclusive and overlapped boundary
 * years). Keep it here so they can never disagree again.
 *
 * `startCol`/`endCol` are the date columns (callers pass them aliased to match
 * their query, e.g. sql`f.start_date`). `from`/`to` are years (a literal, or a
 * SQL expression such as sql`s.bin_start` when joining a generated slice table).
 * EXTRACT over a NULL date yields NULL, so NULL-dated features are excluded
 * without a separate IS NOT NULL guard.
 */
export function featureYearOverlap(
  startCol: SQL,
  endCol: SQL,
  from: number | SQL,
  to: number | SQL
): SQL {
  return sql`EXTRACT(YEAR FROM ${startCol}) < ${to} AND EXTRACT(YEAR FROM ${endCol}) >= ${from}`;
}

/**
 * Body of the `slices` CTE: one row per time bin as [bin_start, bin_end).
 * Use as: sql`WITH ${slicesCTE(first, last, binSize)} SELECT ... JOIN slices s ON ...`.
 * Shared by getHeatmapTimeline and getHistogram.
 */
export function slicesCTE(firstStartYear: number, lastStartYear: number, binSizeYears: number): SQL {
  return sql`slices AS (
    SELECT gs AS bin_start, gs + ${binSizeYears}::int AS bin_end
    FROM generate_series(${firstStartYear}::int, ${lastStartYear}::int, ${binSizeYears}::int) AS gs
  )`;
}
