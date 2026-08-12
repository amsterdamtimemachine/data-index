import { sql, type SQL } from 'drizzle-orm';

/**
 * Half-open, year-based temporal overlap.
 *
 * A feature with date range [start, end] intersects the window [fromYear, toYear)
 * iff  year(start) < toYear  AND  year(end) >= fromYear.
 *
 * Used by getFeatures (the heatmap/histogram paths now read precomputed bins via
 * binWindow in cell-features.ts). Queries used to each inline this predicate,
 * which is exactly how the window semantics drifted (one path was inclusive and
 * overlapped boundary years). Keep it here so they can never disagree again.
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
 * "This feature exists temporally" — the policy for which features the time-based
 * paths see. Shared by the precompute (build-cell-features, rebuild-index) and the
 * slice extent (computeTimeSlices) so they can never include different populations.
 */
export function datedFeatures(startCol: SQL, endCol: SQL): SQL {
  return sql`${startCol} IS NOT NULL AND ${endCol} IS NOT NULL`;
}
