/**
 * The name a place went by at a feature's date, for the card's relation line; null
 * when none applies and the current name stands.
 *
 * Address rows are register observations: the latest one at or before the date
 * names the place. Street rows are validity windows: one must contain the date, a
 * null bound being open, and rows with neither bound are aliases, never shown.
 * Observations sharing a date are ordered by id, so the pick is stable.
 */
import { sql, type SQL } from 'drizzle-orm';

export function historicalLabelSql(placeId: SQL, placeType: SQL, startDate: SQL, endDate: SQL): SQL {
  return sql`(
    SELECT a.name FROM place_historical_name a
    WHERE a.place_id = ${placeId}
      AND CASE ${placeType}
        WHEN 'address' THEN a.since <= ${endDate}
        ELSE (a.since IS NOT NULL OR a.until IS NOT NULL)
          AND (a.since IS NULL OR a.since <= ${endDate})
          AND (a.until IS NULL OR a.until > ${startDate})
      END
    ORDER BY a.since DESC NULLS LAST, a.id LIMIT 1
  )`;
}
