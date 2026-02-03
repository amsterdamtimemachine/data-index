/**
 * Template for creating a new data source ingestion script
 *
 * Copy this file and customize for your data source:
 * 1. Update SOURCE_ID and SOURCE_META
 * 2. Define RawRow interface matching your CSV/JSON structure
 * 3. Implement the ingest function
 */
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { pool } from '../../client';

export const SOURCE_ID = 'my-source';
export const SOURCE_META = {
  id: SOURCE_ID,
  label: 'My Data Source',
  description: 'Description of the data source',
  url: 'https://source-url.com'
};

// Define the shape of your input data
interface RawRow {
  id: string;
  title: string;
  date_start: string;
  date_end: string;
  address_id: string;  // Links to adamlink
  // ... add other fields as needed
}

export async function ingest(filePath: string) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Ensure source exists
    await client.query(`
      INSERT INTO sources (id, label, description, url)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO NOTHING
    `, [SOURCE_META.id, SOURCE_META.label, SOURCE_META.description, SOURCE_META.url]);

    // 2. Stream and insert rows
    const parser = createReadStream(filePath).pipe(parse({ columns: true }));

    let count = 0;
    for await (const row of parser as AsyncIterable<RawRow>) {
      // Insert feature
      await client.query(`
        INSERT INTO features (id, record_type, label, start_date, end_date, source_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO NOTHING
      `, [
        `${SOURCE_ID}:${row.id}`,
        'image',  // or derive from row
        row.title,
        row.date_start || null,
        row.date_end || null,
        SOURCE_ID
      ]);

      // Link to adamlink location
      if (row.address_id) {
        await client.query(`
          INSERT INTO feature_to_adamlink (feature_id, adamlink_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `, [`${SOURCE_ID}:${row.id}`, row.address_id]);
      }

      count++;
      if (count % 1000 === 0) console.log(`Processed ${count} rows`);
    }

    await client.query('COMMIT');
    console.log(`✅ Imported ${count} features from ${SOURCE_ID}`);

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
