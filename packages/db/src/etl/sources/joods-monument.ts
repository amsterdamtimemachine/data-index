/**
 * Import Joods Monument (Jewish Monument) person data
 *
 * Parses CSV of Holocaust victims with last known addresses.
 * Resolves adamlink URIs → place IDs via the address table.
 * Creates new places for addresses not found in LPS.
 * All features get a fixed date range of 1900–1945.
 *
 * Usage: bun run db:ingest -s joods-monument -f <path-to-results_jm.csv>
 */
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { sql } from 'drizzle-orm';
import { db } from '../../client';
import { organisations, datasets, relation, features, featureToPlace, address } from '../../schema';
import type { PersonEntity } from '@atm/shared';

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

/** Prefix for places created on-the-fly when an adamlink URI isn't in LPS. */
const NEW_PLACE_PREFIX = 'jm-';

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
  wkt: string;
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

  console.log(`Streaming ${filePath}...`);

  // Cache: adamlink URI → place ID
  const placeIdCache = new Map<string, string>();
  let newPlaceCounter = 0;

  async function resolvePlaceId(adamlinkUri: string, wkt: string | null): Promise<string | null> {
    const cached = placeIdCache.get(adamlinkUri);
    if (cached !== undefined) return cached;

    // Try to find existing address → place mapping
    const result = await db.execute<PlaceRow>(
      sql`SELECT place_id FROM address WHERE id = ${adamlinkUri}`
    );

    if (result.rows[0]?.place_id) {
      const placeId = result.rows[0].place_id;
      placeIdCache.set(adamlinkUri, placeId);
      return placeId;
    }

    // Address not in LPS — create new place + address if we have geometry
    if (wkt) {
      newPlaceCounter++;
      const placeId = `${NEW_PLACE_PREFIX}${newPlaceCounter}`;

      await db.execute(sql`
        INSERT INTO place (id, type, geometry)
        VALUES (${placeId}, 'address', ST_Transform(ST_GeomFromText(${wkt}, 4326), 28992))
        ON CONFLICT DO NOTHING
      `);

      await db.insert(address).values({
        id: adamlinkUri,
        placeId,
        source: DATASET_ID
      }).onConflictDoNothing();

      placeIdCache.set(adamlinkUri, placeId);
      return placeId;
    }

    return null;
  }

  const csvParser = createReadStream(filePath).pipe(parse({ columns: true }));

  let featureCount = 0;
  let linkCount = 0;
  let skippedLinks = 0;

  let featureBatch: any[] = [];
  let linkBatch: { featureId: string; placeId: string; relationId: string }[] = [];

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
    if (!row.person || !row.address) continue;

    const placeId = await resolvePlaceId(row.address, row.wkt);

    const entity: PersonEntity = {
      type: 'Person',
      name: row.name,
      ...(row.birthDate && { birthDate: row.birthDate }),
      ...(row.birthPlace && { birthPlace: row.birthPlace }),
      ...(row.deathDate && { deathDate: row.deathDate }),
      ...(row.deathPlace && { deathPlace: row.deathPlace })
    };

    const featureId = crypto.randomUUID();

    featureBatch.push({
      id: featureId,
      url: row.person,
      recordType: RECORD_TYPE,
      label: row.name,
      startDate: START_DATE,
      endDate: END_DATE,
      datasetId: DATASET_ID,
      entity
    });

    if (placeId) {
      linkBatch.push({ featureId, placeId, relationId: RELATION_ID });
      linkCount++;
    } else {
      skippedLinks++;
    }

    featureCount++;

    if (featureBatch.length >= BATCH_SIZE) {
      await flush();
    }

    if (featureCount % 1000 === 0) {
      process.stdout.write(`\r  ${featureCount} persons, ${linkCount} links, ${newPlaceCounter} new places, ${skippedLinks} skipped`);
    }
  }

  await flush();

  console.log(`\nDone: ${featureCount} persons, ${linkCount} links, ${newPlaceCounter} new places, ${skippedLinks} skipped`);
}
