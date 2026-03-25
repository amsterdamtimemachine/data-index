/**
 * Template for creating a new data source ingestion script
 *
 * 1. Copy this file and rename to your source name
 * 2. Update SOURCE_ID, source metadata, and relation
 * 3. Define RawRow interface matching your CSV/JSON structure
 * 4. Build the entity object with schema.org type
 * 5. Implement the ingest function
 */
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { db } from '../../client';
import { sources, relation, features, featureToPlace } from '../../schema';

const SOURCE_ID = 'my-source';

interface RawRow {
  id: string;
  title: string;
  date_start: string;
  date_end: string;
  address_id: string;
}

export async function ingest(filePath: string) {
  // 1. Ensure source + relation exist
  await db.insert(sources)
    .values({ id: SOURCE_ID, label: 'My Data Source', url: 'https://source-url.com' })
    .onConflictDoNothing();

  await db.insert(relation)
    .values({ id: 'isAbout', label: 'Is About' })
    .onConflictDoNothing();

  // 2. Stream and insert rows
  const csvParser = createReadStream(filePath).pipe(parse({ columns: true }));

  let count = 0;
  for await (const row of csvParser as AsyncIterable<RawRow>) {
    const featureId = crypto.randomUUID();

    // Build entity (customize per source)
    const entity = {
      type: 'MediaObject' as const,
      label: row.title
    };

    await db.insert(features).values({
      id: featureId,
      url: row.id,
      recordType: 'image',
      label: row.title,
      startDate: row.date_start || null,
      endDate: row.date_end || null,
      sourceId: SOURCE_ID,
      entity
    }).onConflictDoNothing();

    // Link to place
    if (row.address_id) {
      await db.insert(featureToPlace).values({
        featureId,
        placeId: row.address_id,
        relationId: 'isAbout'
      }).onConflictDoNothing();
    }

    count++;
    if (count % 1000 === 0) console.log(`Processed ${count} rows`);
  }

  console.log(`Done: ${count} features from ${SOURCE_ID}`);
}
