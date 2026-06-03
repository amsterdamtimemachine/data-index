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
import { placeName } from '../../schema';
import type { MediaObjectEntity } from '@atm/shared';
import { upsertSource, createFeatureWriter, createCachedResolver, formatDateRange, featureUuid } from '../helpers';

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
  await upsertSource({
    organisation: { id: ORG_ID, label: ORG_LABEL, url: ORG_URL },
    dataset: { id: DATASET_ID, label: DATASET_LABEL, url: DATASET_URL },
    relation: { id: RELATION_ID, label: RELATION_LABEL },
  });

  // Resolve an Adamlink URI to a place id via place_name (cached per run).
  const resolvePlaceId = createCachedResolver(async (adamlinkUri) => {
    const result = await db.execute<PlaceRow>(
      sql`SELECT ${placeName.placeId} as place_id FROM ${placeName} WHERE ${placeName.id} = ${adamlinkUri}`
    );
    return result.rows[0]?.place_id ?? null;
  });

  const csvParser = createReadStream(filePath).pipe(parse({ columns: true }));

  const writer = createFeatureWriter(BATCH_SIZE);
  let count = 0;
  let skipped = 0;

  for await (const row of csvParser as AsyncIterable<RawRow>) {
    const placeId = await resolvePlaceId(row.adamlink_uri);
    if (!placeId) { skipped++; continue; }

    const featureId = featureUuid(row.id);
    const startDate = row.date_start || null;
    const endDate = row.date_end || null;
    const dateCreated = formatDateRange(startDate, endDate);

    const entity: MediaObjectEntity = {
      type: 'MediaObject',
      name: row.title,
      contentUrl: row.content_url,
      ...(dateCreated && { dateCreated })
    };

    writer.addFeature({
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
    writer.addLink({ featureId, placeId, relationId: RELATION_ID });
    count++;

    await writer.flushIfFull();
    if (count % 1000 === 0) process.stdout.write(`\r  ${count} ingested, ${skipped} skipped`);
  }

  await writer.flush();
  console.log(`\nDone: ${count} features, ${skipped} skipped (no matching place)`);
}
