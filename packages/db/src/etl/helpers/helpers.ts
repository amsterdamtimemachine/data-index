/**
 * Shared ETL helpers.
 *
 * Every source script repeated the same handful of patterns: upserting its
 * organisation/dataset/relation, batching feature + link inserts, caching
 * place-id lookups, batching place_historical_name inserts, and inserting place rows with a
 * geometry transform. These are factored out here so the source files only
 * contain what is genuinely source-specific (parsing + how a row maps to a place).
 */
import { sql, inArray } from 'drizzle-orm';
import { createHash } from 'crypto';
import { PLACE_PROVIDERS, type PlaceSource } from '@atm/shared';
import { db } from '../../client';
import {
  organisations,
  datasets,
  relation,
  features,
  featureToPlace,
  placeHistoricalName,
  place,
  placeGeometry,
  type NewFeature,
  type NewPlaceHistoricalName,
} from '../../schema';

type Link = { featureId: string; placeId: string; relationId: string };

// Fixed namespace for deriving deterministic feature ids. Arbitrary constant —
// it only needs to stay the same across runs.
const FEATURE_ID_NAMESPACE = '9f1a7b2c-3d4e-5f60-8a9b-0c1d2e3f4a5b';

/** RFC 4122 name-based (v5) UUID from a namespace UUID + a name string. */
function uuidv5(name: string, namespace: string): string {
  const nsBytes = Uint8Array.from(Buffer.from(namespace.replace(/-/g, ''), 'hex'));
  const bytes = createHash('sha1').update(nsBytes).update(name, 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10x
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Deterministic feature UUID from a dataset id + the source's stable natural key.
 * The dataset id namespaces the key, so identical keys in different datasets
 * (e.g. a bare integer) don't collide.
 */
export function featureUuid(datasetId: string, key: string): string {
  return uuidv5(`${datasetId}:${key}`, FEATURE_ID_NAMESPACE);
}

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
 * Seed the place-provider organisations (Adamlink/CBS/NWB/BAG) that `place.source`
 * references. Idempotent; called by insertPlaces so every place has its provider row
 * before the foreign key is checked. The rows are a materialised copy of PLACE_PROVIDERS.
 */
async function upsertProviders(): Promise<void> {
  await db.insert(organisations)
    .values(Object.entries(PLACE_PROVIDERS).map(([id, { label, url }]) => ({ id, label, url })))
    .onConflictDoNothing();
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

/**
 * Wrap a place-id lookup with a per-run in-memory cache. Many rows resolve the
 * same key (address URI, street URI, geometry WKT), so this avoids repeat queries.
 */
export function createCachedResolver(
  lookup: (key: string) => Promise<string | undefined>
): (key: string) => Promise<string | undefined> {
  const cache = new Map<string, string | undefined>();
  return async (key: string): Promise<string | undefined> => {
    if (cache.has(key)) return cache.get(key);
    const result = await lookup(key);
    cache.set(key, result);
    return result;
  };
}

/** Batched writer for place_historical_name rows. */
export function createNameWriter(batchSize = 1000) {
  let batch: NewPlaceHistoricalName[] = [];

  async function flush(): Promise<void> {
    if (batch.length === 0) return;
    await db.insert(placeHistoricalName).values(batch).onConflictDoNothing();
    batch = [];
  }

  return {
    add(name: NewPlaceHistoricalName): void { batch.push(name); },
    async flushIfFull(): Promise<void> { if (batch.length >= batchSize) await flush(); },
    flush,
  };
}

export interface PlaceInsert {
  id: string;
  type: string;
  label?: string | null;
  wkt: string;
  source?: PlaceSource | null;
  url?: string | null;
  // Geometry provenance, set only when the line comes from a different provider than the
  // place itself (e.g. an Adamlink street backfilled from NWB). Left undefined otherwise.
  geometrySource?: PlaceSource | null;
  geometryUrl?: string | null;
  // Period this geometry was the city's division — set only for neighbourhood/district.
  // Left undefined for address/street. Dates as 'YYYY-MM-DD'.
  since?: string | null;
  until?: string | null;
}

/**
 * How an existing place is refreshed when a re-ingest hits its id:
 *  - 'replaceAll'      : place type + name, and geometry + since/until
 *                        (streets / neighbourhoods / districts, from their TTL).
 *  - 'replaceGeometry' : place type + geometry only, preserving name and
 *                        since/until (LPS — the label is owned by adressen enrichment).
 */
export type PlaceConflict = 'replaceAll' | 'replaceGeometry';

/**
 * Batch-insert places + their geometry with a transform to RD (28992). Writes the
 * identity row to `place` and the geometry row to `place_geometry`.
 *
 * `sourceSrid` is the SRID of the incoming WKT: 28992 is inserted as-is, anything
 * else (e.g. 4326) is wrapped in ST_Transform. `onConflict` selects which columns
 * a re-ingest refreshes (see PlaceConflict). Returns the number of rows inserted.
 */
export async function insertPlaces(
  rows: PlaceInsert[],
  opts: { sourceSrid: number; onConflict: PlaceConflict; batchSize?: number }
): Promise<number> {
  const batchSize = opts.batchSize ?? 500;
  await upsertProviders(); // place.source FKs to these org rows

  // Geometry is PostGIS, so the column value is a sql ST_* expression; the rest
  // of the insert goes through Drizzle's builder. RD (28992) is stored as-is;
  // any other SRID is transformed to RD.
  const geom = (wkt: string) => opts.sourceSrid === 28992
    ? sql`ST_GeomFromText(${wkt}, 28992)`
    : sql`ST_Transform(ST_GeomFromText(${wkt}, ${opts.sourceSrid}), 28992)`;

  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);

    // 1. Identity row in `place`.
    const placeQuery = db.insert(place).values(
      chunk.map(r => ({ id: r.id, type: r.type, name: r.label ?? null, source: r.source ?? null, url: r.url ?? null }))
    );
    if (opts.onConflict === 'replaceGeometry') {
      await placeQuery.onConflictDoUpdate({
        target: place.id,
        set: { type: sql`excluded.type` }, // preserve name, source, url
      });
    } else {
      await placeQuery.onConflictDoUpdate({
        target: place.id,
        set: { type: sql`excluded.type`, name: sql`excluded.name`, source: sql`excluded.source`, url: sql`excluded.url` },
      });
    }

    // 2. Geometry row in `place_geometry` (1:1 with place).
    const geomQuery = db.insert(placeGeometry).values(
      chunk.map(r => ({
        placeId: r.id,
        geometry: geom(r.wkt),
        source: r.geometrySource ?? null,
        url: r.geometryUrl ?? null,
        since: r.since ?? null,
        until: r.until ?? null,
      }))
    );
    if (opts.onConflict === 'replaceGeometry') {
      await geomQuery.onConflictDoUpdate({
        target: placeGeometry.placeId,
        // provenance travels with the geometry; period (since/until) is preserved
        set: { geometry: sql`excluded.geometry`, source: sql`excluded.source`, url: sql`excluded.url` },
      });
    } else {
      await geomQuery.onConflictDoUpdate({
        target: placeGeometry.placeId,
        set: {
          geometry: sql`excluded.geometry`,
          source: sql`excluded.source`,
          url: sql`excluded.url`,
          since: sql`excluded.since`,
          until: sql`excluded.until`,
        },
      });
    }

    inserted += chunk.length;
  }
  return inserted;
}

/**
 * Format a date range for an entity's dateCreated field.
 * Both ends are inclusive: "1948-09-01/1948-09-30" means Sep 1 through Sep 30.
 * Returns "start/end" for ranges, "start" for single dates, undefined if no dates.
 */
export function formatDateRange(startDate: string | null, endDate: string | null): string | undefined {
  if (startDate && endDate && startDate !== endDate) {
    return `${startDate}/${endDate}`;
  }
  if (startDate) {
    return startDate;
  }
  return undefined;
}
