/**
 * Shared ETL helpers.
 *
 * Every source script repeated the same handful of patterns: upserting its
 * organisation/dataset/relation, batching feature + link inserts, caching
 * place-id lookups, batching place_name inserts, and inserting place rows with a
 * geometry transform. These are factored out here so the source files only
 * contain what is genuinely source-specific (parsing + how a row maps to a place).
 */
import { sql } from 'drizzle-orm';
import { db } from '../client';
import {
  organisations,
  datasets,
  relation,
  features,
  featureToPlace,
  placeName,
  place,
  type NewFeature,
  type NewPlaceName,
} from '../schema';

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
 */
export function createFeatureWriter(batchSize = 1000) {
  let featureBatch: NewFeature[] = [];
  let linkBatch: Link[] = [];

  async function flush(): Promise<void> {
    if (featureBatch.length > 0) {
      await db.insert(features).values(featureBatch).onConflictDoNothing();
      featureBatch = [];
    }
    if (linkBatch.length > 0) {
      await db.insert(featureToPlace).values(linkBatch).onConflictDoNothing();
      linkBatch = [];
    }
  }

  return {
    addFeature(feature: NewFeature): void { featureBatch.push(feature); },
    addLink(link: Link): void { linkBatch.push(link); },
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
  lookup: (key: string) => Promise<string | null>
): (key: string) => Promise<string | null> {
  const cache = new Map<string, string | null>();
  return async (key: string): Promise<string | null> => {
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const result = await lookup(key);
    cache.set(key, result);
    return result;
  };
}

/** Batched writer for place_name rows. */
export function createNameWriter(batchSize = 1000) {
  let batch: NewPlaceName[] = [];

  async function flush(): Promise<void> {
    if (batch.length === 0) return;
    await db.insert(placeName).values(batch).onConflictDoNothing();
    batch = [];
  }

  return {
    add(name: NewPlaceName): void { batch.push(name); },
    async flushIfFull(): Promise<void> { if (batch.length >= batchSize) await flush(); },
    flush,
  };
}

export interface PlaceInsert {
  id: string;
  type: string;
  label?: string | null;
  wkt: string;
}

/**
 * Batch-insert place rows with a geometry transform to RD (28992).
 *
 * `sourceSrid` is the SRID of the incoming WKT: 28992 is inserted as-is, anything
 * else (e.g. 4326) is wrapped in ST_Transform. `onConflict: 'update'` refreshes
 * type / label / geometry on re-ingest; 'nothing' leaves existing rows untouched
 * (used by LPS, whose preferred_label is set later by the adressen enrichment).
 * Returns the number of rows inserted.
 */
export async function insertPlaces(
  rows: PlaceInsert[],
  opts: { sourceSrid: number; onConflict: 'nothing' | 'update'; batchSize?: number }
): Promise<number> {
  const batchSize = opts.batchSize ?? 500;

  // Geometry is PostGIS, so the column value is a sql ST_* expression; the rest
  // of the insert goes through Drizzle's builder. RD (28992) is stored as-is;
  // any other SRID is transformed to RD.
  const geom = (wkt: string) => opts.sourceSrid === 28992
    ? sql`ST_GeomFromText(${wkt}, 28992)`
    : sql`ST_Transform(ST_GeomFromText(${wkt}, ${opts.sourceSrid}), 28992)`;

  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const values = chunk.map(r => ({
      id: r.id,
      type: r.type,
      preferredLabel: r.label ?? null,
      geometry: geom(r.wkt),
    }));

    const query = db.insert(place).values(values);
    if (opts.onConflict === 'update') {
      await query.onConflictDoUpdate({
        target: place.id,
        set: {
          type: sql`excluded.type`,
          preferredLabel: sql`excluded.preferred_label`,
          geometry: sql`excluded.geometry`,
        },
      });
    } else {
      await query.onConflictDoNothing();
    }
    inserted += chunk.length;
  }
  return inserted;
}

/** Adamlink address URI for a registry address id. */
export function adamlinkAddressUri(adresId: string): string {
  return `https://adamlink.nl/geo/address/${adresId}`;
}
