import { sql } from 'drizzle-orm';
import type { RecordType } from '@atm/shared';
import { db } from '../client';
import { features } from '../schema';

type RecordTypeRow = { record_type: RecordType };

/**
 * All distinct record types present in the features table, ordered.
 *
 * Single source of truth for the "no recordTypes filter specified" default. The
 * heatmap, feature list, histogram, tags and metadata must all fall back to the
 * SAME set — a hard-coded default in one place silently diverging from this is
 * what made hover counts disagree with the per-cell feature list.
 */
export async function getRecordTypes(): Promise<RecordType[]> {
  const result = await db.execute<RecordTypeRow>(sql`
    SELECT DISTINCT ${features.recordType} as record_type
    FROM ${features}
    WHERE ${features.recordType} IS NOT NULL
    ORDER BY ${features.recordType}
  `);
  return result.rows.map(r => r.record_type);
}
