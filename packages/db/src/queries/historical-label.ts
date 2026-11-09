/**
 * The name a place went by at a feature's date, for the card's relation line; null
 * when none applies and the current name stands.
 *
 * Address rows are register observations: the one nearest the date names the place,
 * by the same nearness the name resolver ranks observations by, so the card shows the
 * record the link was made through. Street rows are validity windows: one must
 * contain the date, a null bound being open, and rows with neither bound are aliases,
 * never shown. Observations at equal distance are ordered later first, then by id, so
 * the pick is stable.
 */
import { sql, type SQL } from 'drizzle-orm';

export function historicalLabelSql(placeId: SQL, placeType: SQL, startDate: SQL, endDate: SQL): SQL {
  // days from the feature range to an observation; 0 when they overlap
  const gap = sql`GREATEST(a.since - ${endDate}, ${startDate} - COALESCE(a.until, a.since), 0)`;
  return sql`(
    SELECT a.name FROM place_historical_name a
    WHERE a.place_id = ${placeId}
      AND CASE ${placeType}
        WHEN 'address' THEN a.since IS NOT NULL
        ELSE (a.since IS NOT NULL OR a.until IS NOT NULL)
          AND (a.since IS NULL OR a.since <= ${endDate})
          AND (a.until IS NULL OR a.until > ${startDate})
      END
    ORDER BY CASE ${placeType} WHEN 'address' THEN ${gap} ELSE 0 END, a.since DESC NULLS LAST, a.id LIMIT 1
  )`;
}
