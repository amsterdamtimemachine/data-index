import { isNotNull } from 'drizzle-orm';
import type { RecordType } from '@atm/shared';
import { db } from '../client';
import { features } from '../schema';
import { createTTLCache } from './cache';

const cache = createTTLCache<RecordType[]>();

/**
 * All distinct record types present in the features table, ordered. Cached: it
 * is the fallback of every unfiltered request and only changes after ingest.
 *
 * Single source of truth for the "no recordTypes filter specified" default. The
 * heatmap, feature list, histogram, tags and metadata must all fall back to the
 * SAME set — a hard-coded default in one place silently diverging from this is
 * what made hover counts disagree with the per-cell feature list.
 */
export async function getRecordTypes(): Promise<RecordType[]> {
  const cached = cache.get();
  if (cached) return cached;

  const rows = await db
    .selectDistinct({ recordType: features.recordType })
    .from(features)
    .where(isNotNull(features.recordType))
    .orderBy(features.recordType);
  const types = rows.map(r => r.recordType as RecordType);
  cache.set(types);
  return types;
}
