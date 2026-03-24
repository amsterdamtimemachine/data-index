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
import { pool } from '../../client';

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
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create source
    await client.query(`
      INSERT INTO sources (id, label, url)
      VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING
    `, [SOURCE_ID, 'Joods Monument', 'https://www.joodsmonument.nl']);

    // Create relation
    await client.query(`
      INSERT INTO relation (id, label)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `, ['hadLastLivingLocation', 'Had last living location']);

    console.log(`Streaming ${filePath}...`);

    const csvParser = createReadStream(filePath).pipe(parse({ columns: true }));

    let featureCount = 0;
    let placeCount = 0;
    let linkCount = 0;

    for await (const row of csvParser as AsyncIterable<RawRow>) {
      if (!row.person || !row.address) continue;

      // Insert place if not exists (WGS84 → RD transform)
      if (row.wkt) {
        await client.query(`
          INSERT INTO place (id, type, geometry)
          VALUES ($1, 'address', ST_Transform(ST_GeomFromText($2, 4326), 28992))
          ON CONFLICT DO NOTHING
        `, [row.address, row.wkt]);
        placeCount++;
      }

      // Insert feature
      await client.query(`
        INSERT INTO features (id, record_type, label, start_date, end_date, source_id)
        VALUES ($1, 'person', $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
      `, [row.person, row.name, START_DATE, END_DATE, SOURCE_ID]);
      featureCount++;

      // Link feature to place
      await client.query(`
        INSERT INTO feature_to_place (feature_id, place_id, relation_id)
        VALUES ($1, $2, 'hadLastLivingLocation')
        ON CONFLICT DO NOTHING
      `, [row.person, row.address]);
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
