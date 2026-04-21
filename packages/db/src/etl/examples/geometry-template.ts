/**
 * Example: Ingesting a dataset without Adamlink references
 *
 * Use this template when your source data only has coordinates (WKT geometry
 * points) and does not reference Adamlink address URIs. The script matches
 * each geometry to the nearest existing place within a configurable distance
 * threshold. Features with no nearby place are skipped.
 *
 * To use:
 * 1. Copy to packages/db/src/etl/sources/<your-dataset>.ts
 * 2. Fill in the Organisation / Dataset / Feature metadata blocks at the top
 *    (and tune MATCH_THRESHOLD_METERS for your data)
 * 3. Adjust RawRow to match your CSV/JSON structure
 * 4. Adjust the entity type and field mapping
 * 5. Run: bun run db:ingest -s <your-dataset> -f <path-to-file>
 */
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { sql } from 'drizzle-orm';
import { db } from '../../client';
import { organisations, datasets, relation, features, featureToPlace } from '../../schema';
import type { CreativeWorkEntity } from '@atm/shared';
import { formatDateRange } from '../utils';

// ═══════════════════════════════════════════════════════════════
//  Organisation
// ═══════════════════════════════════════════════════════════════
const ORG_ID = 'my-org';
const ORG_LABEL = 'My Organisation';
const ORG_URL = 'https://org-url.com';

// ═══════════════════════════════════════════════════════════════
//  Dataset
// ═══════════════════════════════════════════════════════════════
const DATASET_ID = 'my-dataset';
const DATASET_LABEL = 'My Dataset';
const DATASET_URL = 'https://dataset-url.com';

// ═══════════════════════════════════════════════════════════════
//  Feature metadata
// ═══════════════════════════════════════════════════════════════
const RECORD_TYPE = 'text'; // 'image' | 'text' | 'person'
const RELATION_ID = 'isAbout';
const RELATION_LABEL = 'Is About';

// ═══════════════════════════════════════════════════════════════
//  Ingestion tuning
// ═══════════════════════════════════════════════════════════════
/** Max distance in meters to match a geometry to an existing place.
 *  Increase for less precise coordinates, decrease for denser areas. */
const MATCH_THRESHOLD_METERS = 5;
const BATCH_SIZE = 1000;

interface RawRow {
  id: string;
  title: string;
  url: string;
  date_start: string;
  date_end: string;
  geom_wkt: string;     // e.g. "POINT(4.901959 52.376688)" in WGS84
}

type PlaceMatch = { place_id: string };

export async function ingest(filePath: string) {
  await db.insert(organisations)
    .values({ id: ORG_ID, label: ORG_LABEL, url: ORG_URL })
    .onConflictDoNothing();

  await db.insert(datasets)
    .values({ id: DATASET_ID, label: DATASET_LABEL, url: DATASET_URL, organisationId: ORG_ID })
    .onConflictDoNothing();

  await db.insert(relation)
    .values({ id: RELATION_ID, label: RELATION_LABEL })
    .onConflictDoNothing();

  console.log(`Match threshold: ${MATCH_THRESHOLD_METERS}m`);

  // Cache: WKT → place ID (many rows often share the same geometry)
  const placeCache = new Map<string, string | null>();

  async function resolvePlaceId(wkt: string): Promise<string | null> {
    if (placeCache.has(wkt)) return placeCache.get(wkt)!;

    const result = await db.execute<PlaceMatch>(sql`
      SELECT p.id as place_id
      FROM place p
      WHERE ST_DWithin(
        p.geometry,
        ST_Transform(ST_GeomFromText(${wkt}, 4326), 28992),
        ${MATCH_THRESHOLD_METERS}
      )
      ORDER BY p.geometry <-> ST_Transform(ST_GeomFromText(${wkt}, 4326), 28992)
      LIMIT 1
    `);

    const placeId = result.rows[0]?.place_id || null;
    placeCache.set(wkt, placeId);
    return placeId;
  }

  const csvParser = createReadStream(filePath).pipe(
    parse({ columns: true, relax_column_count: true, relax_quotes: true })
  );

  let featureBatch: any[] = [];
  let linkBatch: { featureId: string; placeId: string; relationId: string }[] = [];
  let count = 0;
  let skipped = 0;

  async function flush() {
    if (featureBatch.length > 0) {
      await db.insert(features).values(featureBatch).onConflictDoNothing();
      featureBatch = [];
    }
    if (linkBatch.length > 0) {
      await db.insert(featureToPlace).values(linkBatch).onConflictDoNothing();
      linkBatch = [];
    }
  }

  for await (const row of csvParser as AsyncIterable<RawRow>) {
    if (!row.geom_wkt) continue;

    const placeId = await resolvePlaceId(row.geom_wkt);
    if (!placeId) { skipped++; continue; }

    const featureId = crypto.randomUUID();
    const startDate = row.date_start || null;
    const endDate = row.date_end || null;
    const dateCreated = formatDateRange(startDate, endDate);

    const entity: CreativeWorkEntity = {
      type: 'CreativeWork',
      name: row.title || '',
      url: row.url,
      ...(dateCreated && { dateCreated })
    };

    featureBatch.push({
      id: featureId,
      url: row.url,
      recordType: RECORD_TYPE,
      label: row.title || '',
      contentUrl: row.url,
      startDate,
      endDate,
      datasetId: DATASET_ID,
      entity
    });

    linkBatch.push({ featureId, placeId, relationId: RELATION_ID });
    count++;

    if (featureBatch.length >= BATCH_SIZE) await flush();
    if ((count + skipped) % 1000 === 0) {
      process.stdout.write(`\r  ${count} ingested, ${skipped} skipped, ${placeCache.size} geometries cached`);
    }
  }

  await flush();
  console.log(`\nDone: ${count} features, ${skipped} skipped (no place within ${MATCH_THRESHOLD_METERS}m)`);
}
