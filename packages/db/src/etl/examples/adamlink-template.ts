/**
 * Example: Ingesting a dataset that references Adamlink address URIs
 *
 * Use this template when your source data links to places via Adamlink URIs
 * (e.g. https://adamlink.nl/geo/address/A12345). The script resolves each URI
 * to a place ID via the place_name table. Requires LPS + adressen data to be
 * ingested first.
 *
 * To use:
 * 1. Copy to packages/db/src/etl/sources/<your-dataset>.ts
 * 2. Fill in the Organisation / Dataset / Feature metadata blocks at the top
 * 3. Adjust RawRow to match your CSV/JSON structure
 * 4. Adjust the entity type and field mapping
 * 5. Run: bun run db:ingest -s <your-dataset> -f <path-to-file>
 */
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { sql } from 'drizzle-orm';
import { db } from '../../client';
import { organisations, datasets, relation, features, featureToPlace, placeName } from '../../schema';
import type { MediaObjectEntity } from '@atm/shared';
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
const RECORD_TYPE = 'image'; // 'image' | 'text' | 'person'
const RELATION_ID = 'isAbout';
const RELATION_LABEL = 'Is About';

const BATCH_SIZE = 1000;

interface RawRow {
  id: string;
  title: string;
  content_url: string;
  date_start: string;
  date_end: string;
  adamlink_uri: string;    // e.g. https://adamlink.nl/geo/address/A12345
}

type PlaceRow = { place_id: string };

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

  // Cache: adamlink URI → place ID
  const placeCache = new Map<string, string | null>();

  async function resolvePlaceId(adamlinkUri: string): Promise<string | null> {
    if (placeCache.has(adamlinkUri)) return placeCache.get(adamlinkUri)!;

    const result = await db.execute<PlaceRow>(
      sql`SELECT ${placeName.placeId} as place_id FROM ${placeName} WHERE ${placeName.id} = ${adamlinkUri}`
    );
    const placeId = result.rows[0]?.place_id || null;
    if (placeId) placeCache.set(adamlinkUri, placeId);
    return placeId;
  }

  const csvParser = createReadStream(filePath).pipe(parse({ columns: true }));

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
    const placeId = await resolvePlaceId(row.adamlink_uri);
    if (!placeId) { skipped++; continue; }

    const featureId = crypto.randomUUID();
    const startDate = row.date_start || null;
    const endDate = row.date_end || null;

    const entity: MediaObjectEntity = {
      type: 'MediaObject',
      name: row.title,
      contentUrl: row.content_url,
      ...(formatDateRange(startDate, endDate) && { dateCreated: formatDateRange(startDate, endDate) })
    };

    featureBatch.push({
      id: featureId,
      url: row.id,
      recordType: RECORD_TYPE,
      label: row.title,
      contentUrl: row.content_url || null,
      startDate,
      endDate,
      datasetId: DATASET_ID,
      entity
    });

    linkBatch.push({ featureId, placeId, relationId: RELATION_ID });
    count++;

    if (featureBatch.length >= BATCH_SIZE) await flush();
    if (count % 1000 === 0) process.stdout.write(`\r  ${count} ingested, ${skipped} skipped`);
  }

  await flush();
  console.log(`\nDone: ${count} features, ${skipped} skipped (no matching place)`);
}
