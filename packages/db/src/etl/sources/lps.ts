/**
 * Import place data from LPS (Linked Point Set) CSV
 *
 * Parses address -> WKT geometry mappings from multiple historical datasets
 * and inserts them into the `place` table with RD (28992) coordinates.
 *
 * Usage: bun run db:ingest -s lps -f ../../data/20230920-lps.csv
 */
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { pool } from '../../client';

const ADDR_COLS = [
  'pw-1943',
  'pw-1909',
  'obelt-1920',
  'loman-1976',
  'bevolkingsregister-1870',
  'wijken-1853',
  'percelen-1832'
];

const BATCH_SIZE = 5000;

export async function ingest(filePath: string) {
  const client = await pool.connect();

  // Collect all address -> wkt mappings
  const addrToWkt = new Map<string, string>();

  console.log('Parsing LPS CSV...');
  const csvParser = createReadStream(filePath).pipe(parse({ columns: true }));

  for await (const row of csvParser) {
    const wkt = row.wkt;
    for (const col of ADDR_COLS) {
      const addrId = row[col]?.trim();
      if (addrId) {
        addrToWkt.set(addrId, wkt);
      }
    }
  }
  console.log(`Mapped ${addrToWkt.size} address IDs`);

  // Batch insert
  console.log('Inserting into place...');
  let batch: string[] = [];
  let total = 0;

  for (const [addrId, wkt] of addrToWkt) {
    const uri = `https://adamlink.nl/geo/address/${addrId}`;
    batch.push(`('${uri}', 'address', ST_GeomFromText('${wkt}', 28992))`);

    if (batch.length >= BATCH_SIZE) {
      await client.query(`INSERT INTO place (id, type, geometry) VALUES ${batch.join(',')} ON CONFLICT DO NOTHING`);
      total += batch.length;
      process.stdout.write(`\r  ${total} inserted...`);
      batch = [];
    }
  }

  if (batch.length > 0) {
    await client.query(`INSERT INTO place (id, type, geometry) VALUES ${batch.join(',')} ON CONFLICT DO NOTHING`);
    total += batch.length;
  }

  console.log(`\nDone: ${total} place entries`);
  client.release();
}
