/**
 * Import Joods Monument (Jewish Monument) person data
 *
 * Parses CSV of Holocaust victims with last known addresses.
 * Links persons to places via adamlink URIs, inserting new places
 * (with WGS84→RD coordinate transform) if they don't exist from LPS.
 * All features get a fixed date range of 1940–1945.
 *
 * Usage: bun run db:ingest -s joods-monument -f ../../data/results_jm.csv
 */
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { sql } from 'drizzle-orm';
import { db } from '../../client';
import { pool } from '../../client';
import { sources, relation, features, featureToPlace } from '../../schema';
import type { PersonEntity } from '@atm/shared';

const SOURCE_ID = 'joods-monument';
const START_DATE = '1940-01-01';
const END_DATE = '1945-12-31';

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

export async function ingest(filePath: string) {
  // Create source + relation via Drizzle
  await db.insert(sources)
    .values({ id: SOURCE_ID, label: 'Joods Monument', url: 'https://www.joodsmonument.nl' })
    .onConflictDoNothing();

  await db.insert(relation)
    .values({ id: 'hadLastLivingLocation', label: 'Had last living location' })
    .onConflictDoNothing();

  console.log(`Streaming ${filePath}...`);

  // Raw client needed for ST_Transform (PostGIS-specific SQL)
  const client = await pool.connect();

  const csvParser = createReadStream(filePath).pipe(parse({ columns: true }));

  let featureCount = 0;
  let placeCount = 0;
  let linkCount = 0;

  try {
    await client.query('BEGIN');

    for await (const row of csvParser as AsyncIterable<RawRow>) {
      if (!row.person || !row.address) continue;

      // Insert place if not exists (WGS84 → RD transform — raw SQL required)
      if (row.wkt) {
        await client.query(`
          INSERT INTO place (id, type, geometry)
          VALUES ($1, 'address', ST_Transform(ST_GeomFromText($2, 4326), 28992))
          ON CONFLICT DO NOTHING
        `, [row.address, row.wkt]);
        placeCount++;
      }

      // Build entity
      const entity: PersonEntity = {
        type: 'Person',
        label: row.name,
        ...(row.birthDate && { birthDate: row.birthDate }),
        ...(row.birthPlace && { birthPlace: row.birthPlace }),
        ...(row.deathDate && { deathDate: row.deathDate }),
        ...(row.deathPlace && { deathPlace: row.deathPlace })
      };

      const featureId = crypto.randomUUID();

      // Insert feature via Drizzle
      await db.insert(features).values({
        id: featureId,
        url: row.person,
        recordType: 'person',
        label: row.name,
        startDate: START_DATE,
        endDate: END_DATE,
        sourceId: SOURCE_ID,
        entity
      }).onConflictDoNothing();

      featureCount++;

      // Link feature to place via Drizzle
      await db.insert(featureToPlace).values({
        featureId,
        placeId: row.address,
        relationId: 'hadLastLivingLocation'
      }).onConflictDoNothing();

      linkCount++;

      if (featureCount % 1000 === 0) {
        process.stdout.write(`\r  ${featureCount} persons, ${placeCount} places, ${linkCount} links`);
      }
    }

    await client.query('COMMIT');
    console.log(`\nDone: ${featureCount} persons, ${placeCount} places (new), ${linkCount} links`);

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
