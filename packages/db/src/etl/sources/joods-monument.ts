/**
 * Import Joods Monument (Jewish Monument) person data
 *
 * Parses CSV of Holocaust victims with last known addresses. Resolves adamlink
 * URIs → place IDs via the place_name table (populated by LPS). Rows whose
 * adamlink URI isn't in LPS are skipped — no feature is created. All features
 * get a fixed date range of 1900–1945.
 *
 * Usage: bun run db:ingest -s joods-monument -f <path-to-results_jm.csv>
 */
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { sql } from 'drizzle-orm';
import { db } from '../../client';
import type { PlaceIdRow } from '../../row-types';
import type { PersonEntity } from '@atm/shared';
import { upsertSource, createFeatureWriter, createCachedResolver, featureUuid } from '../helpers';

// ═══════════════════════════════════════════════════════════════
//  Organisation
// ═══════════════════════════════════════════════════════════════
const ORG_ID = 'joods-monument';
const ORG_LABEL = 'Joods Monument';
const ORG_URL = 'https://www.joodsmonument.nl';

// ═══════════════════════════════════════════════════════════════
//  Dataset
// ═══════════════════════════════════════════════════════════════
const DATASET_ID = 'joods-monument';
const DATASET_LABEL = 'Joods Monument';
const DATASET_URL = 'https://www.joodsmonument.nl';

// ═══════════════════════════════════════════════════════════════
//  Feature metadata
// ═══════════════════════════════════════════════════════════════
const RECORD_TYPE = 'person';
const RELATION_ID = 'hadLastLivingLocation';
const RELATION_LABEL = 'Had last living location';

/** All Joods Monument features use this fixed date range. */
const START_DATE = '1900-01-01';
const END_DATE = '1945-12-31';

const BATCH_SIZE = 1000;

interface RawRow {
  person: string;
  name: string;
  location: string;
  birthPlace: string;
  birthDate: string;
  deathDate: string;
  deathPlace: string;
  address: string;
  addressName: string;
}

export async function ingest(filePath: string) {
  await upsertSource({
    organisation: { id: ORG_ID, label: ORG_LABEL, url: ORG_URL },
    dataset: { id: DATASET_ID, label: DATASET_LABEL, url: DATASET_URL },
    relation: { id: RELATION_ID, label: RELATION_LABEL },
  });

  console.log(`Streaming ${filePath}...`);

  const resolvePlaceId = createCachedResolver(async (adamlinkUri) => {
    const result = await db.execute<PlaceIdRow>(
      sql`SELECT place_id FROM place_name WHERE id = ${adamlinkUri}`
    );
    return result.rows[0]?.place_id ?? null;
  });

  const csvParser = createReadStream(filePath).pipe(parse({ columns: true }));

  const writer = createFeatureWriter(BATCH_SIZE);
  // The source lists some people on several rows — identical except for a jittered
  // `wkt` we don't use (jm links by the adamlink address URI). Dedup by person page
  // id so we don't emit the same feature id twice (which the upsert would reject).
  const committedPersons = new Set<string>();
  const seenLinks = new Set<string>();
  let featureCount = 0;
  let linkCount = 0;
  let skipped = 0;
  let duplicates = 0;

  for await (const row of csvParser as AsyncIterable<RawRow>) {
    if (!row.person || !row.address) continue;

    const placeId = await resolvePlaceId(row.address);
    if (!placeId) {
      skipped++;
      continue;
    }

    const personId = row.person.match(/\/page\/(\d+)/)?.[1] ?? row.person;
    const featureId = featureUuid(personId);

    if (committedPersons.has(personId)) {
      duplicates++;
    } else {
      committedPersons.add(personId);
      const entity: PersonEntity = {
        type: 'Person',
        name: row.name,
        ...(row.birthDate && { birthDate: row.birthDate }),
        ...(row.birthPlace && { birthPlace: row.birthPlace }),
        ...(row.deathDate && { deathDate: row.deathDate }),
        ...(row.deathPlace && { deathPlace: row.deathPlace })
      };
      writer.addFeature({
        id: featureId,
        url: row.person,
        recordType: RECORD_TYPE,
        label: row.name,
        startDate: START_DATE,
        endDate: END_DATE,
        datasetId: DATASET_ID,
        entity
      });
      featureCount++;
    }

    const linkKey = `${featureId}|${placeId}`;
    if (!seenLinks.has(linkKey)) {
      seenLinks.add(linkKey);
      writer.addLink({ featureId, placeId, relationId: RELATION_ID });
      linkCount++;
    }

    await writer.flushIfFull();

    if ((featureCount + duplicates + skipped) % 1000 === 0) {
      process.stdout.write(`\r  ${featureCount} persons, ${duplicates} duplicates, ${skipped} skipped`);
    }
  }

  await writer.flush();

  console.log(`\nDone: ${featureCount} features, ${linkCount} links, ${duplicates} duplicate rows skipped, ${skipped} skipped (no matching place)`);
}
