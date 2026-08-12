/**
 * Feature-side DB writers: register a source's organisation/dataset/relation, and
 * batch feature + feature_to_place link inserts. Used by the feature-ingest base
 * (ingest/ingestor.ts).
 */
import { sql, inArray } from 'drizzle-orm';
import { db } from '../../client';
import {
  organisations,
  datasets,
  relation,
  features,
  featureToPlace,
  type NewFeature,
} from '../../schema';

type Link = { featureId: string; placeId: string; relationId: string };

/**
 * Upsert a source's organisation, dataset and (optionally) relation rows.
 * Idempotent — safe to call at the top of every ingest run.
 */
export async function upsertSource(opts: {
  organisation: { id: string; label: string; url?: string };
  dataset: { id: string; label: string; url?: string };
  relation?: { id: string; label: string };
}): Promise<void> {
  await db.insert(organisations).values(opts.organisation).onConflictDoNothing();
  await db.insert(datasets)
    .values({ ...opts.dataset, organisationId: opts.organisation.id })
    .onConflictDoNothing();
  if (opts.relation) {
    await db.insert(relation).values(opts.relation).onConflictDoNothing();
  }
}

/**
 * Batched writer for features and their feature_to_place links. Owns its batches
 * so callers just add() and let it flush at the size threshold (and once at the
 * end). Replaces the byte-identical flush() each feature source carried.
 *
 * Idempotent re-ingest (features carry a deterministic id from featureId()):
 *  - features upsert (onConflictDoUpdate) so a corrected file refreshes content
 *    in place — but NOT temporal_frequency, which rebuild-index owns.
 *  - links are reconciled: the first time a feature is seen this run its existing
 *    feature_to_place rows are deleted, so a corrected place assignment replaces
 *    the old link instead of accumulating a second one. The delete happens once
 *    per feature per run, so links added across multiple flushes still accrue.
 */
export function createFeatureWriter(batchSize = 1000) {
  let featureBatch: NewFeature[] = [];
  let linkBatch: Link[] = [];
  const linksCleared = new Set<string>(); // features whose stale links were already deleted this run
  let pendingLinkDeletes: string[] = [];

  async function flush(): Promise<void> {
    if (featureBatch.length > 0) {
      // No intra-batch dedup here: a source must not emit the same feature id twice
      // in one batch (Postgres rejects DO UPDATE touching a row twice). Sources that
      // can repeat a feature dedup at the source (see joods-monument / beeldbank).
      await db.insert(features).values(featureBatch).onConflictDoUpdate({
        target: features.id,
        set: {
          url: sql`excluded.url`,
          recordType: sql`excluded.record_type`,
          label: sql`excluded.label`,
          description: sql`excluded.description`,
          contentUrl: sql`excluded.content_url`,
          startDate: sql`excluded.start_date`,
          endDate: sql`excluded.end_date`,
          datasetId: sql`excluded.dataset_id`,
          entity: sql`excluded.entity`,
        },
      });
      featureBatch = [];
    }
    // Clear old links for re-seen features before inserting this run's links.
    if (pendingLinkDeletes.length > 0) {
      await db.delete(featureToPlace).where(inArray(featureToPlace.featureId, pendingLinkDeletes));
      pendingLinkDeletes = [];
    }
    if (linkBatch.length > 0) {
      await db.insert(featureToPlace).values(linkBatch).onConflictDoNothing();
      linkBatch = [];
    }
  }

  return {
    addFeature(feature: NewFeature): void { featureBatch.push(feature); },
    addLink(link: Link): void {
      if (!linksCleared.has(link.featureId)) {
        linksCleared.add(link.featureId);
        pendingLinkDeletes.push(link.featureId);
      }
      linkBatch.push(link);
    },
    /** Flush when either batch reaches the threshold. */
    async flushIfFull(): Promise<void> {
      if (featureBatch.length >= batchSize || linkBatch.length >= batchSize) await flush();
    },
    flush,
  };
}
