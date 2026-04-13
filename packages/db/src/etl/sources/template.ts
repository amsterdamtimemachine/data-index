/**
 * Template for creating a new data source ingestion script
 *
 * 1. Copy this file and rename to your source name
 * 2. Update SOURCE_ID, source metadata, and relation
 * 3. Define RawRow interface matching your CSV/JSON structure
 * 4. Build the entity object with schema.org type (Person | MediaObject)
 * 5. Implement the ingest function
 */
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { db } from '../../client';
import { organisations, datasets, relation, features, featureToPlace } from '../../schema';
import type { MediaObjectEntity } from '@atm/shared';
import { formatDateRange } from '../utils';

const SOURCE_ID = 'my-source';
const BATCH_SIZE = 1000;

interface RawRow {
  id: string;
  title: string;
  content_url: string;
  date_start: string;
  date_end: string;
  address_id: string;
}

export async function ingest(filePath: string) {
  // 1. Ensure source + relation exist
  await db.insert(organisations)
    .values({ id: 'my-org', label: 'My Organisation', url: 'https://org-url.com' })
    .onConflictDoNothing();

  await db.insert(datasets)
    .values({ id: SOURCE_ID, label: 'My Dataset', url: 'https://source-url.com', organisationId: 'my-org' })
    .onConflictDoNothing();

  await db.insert(relation)
    .values({ id: 'isAbout', label: 'Is About' })
    .onConflictDoNothing();

  // 2. Stream and insert rows
  const csvParser = createReadStream(filePath).pipe(parse({ columns: true }));

  let featureBatch: any[] = [];
  let linkBatch: { featureId: string; placeId: string; relationId: string }[] = [];
  let count = 0;

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
    const featureId = crypto.randomUUID();
    const startDate = row.date_start || null;
    const endDate = row.date_end || null;

    const entity: MediaObjectEntity = {
      type: 'MediaObject',
      label: row.title,
      contentUrl: row.content_url,
      ...(formatDateRange(startDate, endDate) && { dateCreated: formatDateRange(startDate, endDate) })
    };

    featureBatch.push({
      id: featureId,
      url: row.id,
      recordType: 'image',
      label: row.title,
      contentUrl: row.content_url || null,
      startDate,
      endDate,
      datasetId: SOURCE_ID,
      entity
    });

    if (row.address_id) {
      linkBatch.push({
        featureId,
        placeId: row.address_id,
        relationId: 'isAbout'
      });
    }

    count++;
    if (featureBatch.length >= BATCH_SIZE) {
      await flush();
    }
    if (count % 1000 === 0) {
      process.stdout.write(`\r  ${count} processed...`);
    }
  }

  await flush();
  console.log(`\nDone: ${count} features from ${SOURCE_ID}`);
}
