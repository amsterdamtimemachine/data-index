/**
 * Links a dataset holds to a place whose period excludes the feature's date: the
 * source and the place data disagree about when the place existed. Counted for the
 * ingest summary and never acted on; the source's link stands. A type without a
 * period (an address: its dates are register records, not a lifespan) never counts.
 */
import { sql } from 'drizzle-orm';
import { db } from '../../client';
import type { CountRow } from '../../row-types';

export async function countOutOfPeriodLinks(datasetId: string): Promise<number> {
  // until is exclusive, as place_geometry records it
  const result = await db.execute<CountRow>(sql`
    SELECT COUNT(*) AS count
    FROM feature_to_place fp
    JOIN features f ON f.id = fp.feature_id
    JOIN place_geometry pg ON pg.place_id = fp.place_id
    WHERE f.dataset_id = ${datasetId}
      AND (pg.since > f.end_date OR pg.until <= f.start_date)
  `);
  return parseInt(result.rows[0].count);
}
