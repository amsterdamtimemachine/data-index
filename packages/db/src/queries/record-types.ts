import { isNotNull } from 'drizzle-orm';
import type { RecordType } from '@atm/shared';
import { db } from '../client';
import { features } from '../schema';

/**
 * All distinct record types present in the features table, ordered.
 *
 * Single source of truth for the "no recordTypes filter specified" default. The
 * heatmap, feature list, histogram, tags and metadata must all fall back to the
 * SAME set — a hard-coded default in one place silently diverging from this is
 * what made hover counts disagree with the per-cell feature list.
 */
export async function getRecordTypes(): Promise<RecordType[]> {
  const rows = await db
    .selectDistinct({ recordType: features.recordType })
    .from(features)
    .where(isNotNull(features.recordType))
    .orderBy(features.recordType);
  return rows.map(r => r.recordType as RecordType);
}
