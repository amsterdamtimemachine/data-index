/**
 * Import place data from LPS (Linked Point Set) CSV
 *
 * Creates one place per linked point (lp) with geometry, and one address
 * row per historical address ID linking to that place.
 *
 * Usage: bun run db:ingest -s lps -f ../../data/20230920-lps.csv
 */
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { sql } from 'drizzle-orm';
import { db } from '../../client';
import { address } from '../../schema';

const ADDR_COLS: { col: string; source: string; date: string }[] = [
  { col: 'pw-1943', source: 'pw-1943', date: '1943-01-01' },
  { col: 'pw-1909', source: 'pw-1909', date: '1909-01-01' },
  { col: 'obelt-1920', source: 'obelt-1920', date: '1920-01-01' },
  { col: 'loman-1976', source: 'loman-1976', date: '1976-01-01' },
  { col: 'bevolkingsregister-1870', source: 'bevolkingsregister-1870', date: '1870-01-01' },
  { col: 'wijken-1853', source: 'wijken-1853', date: '1853-01-01' },
  { col: 'percelen-1832', source: 'percelen-1832', date: '1832-01-01' },
];

const BATCH_SIZE = 1000;

export async function ingest(filePath: string) {
  console.log(`Parsing ${filePath}...`);
  const csvParser = createReadStream(filePath).pipe(parse({ columns: true }));

  let placeCount = 0;
  let addressCount = 0;
  let addressBatch: { id: string; placeId: string; date: string; source: string }[] = [];

  async function flushAddresses() {
    if (addressBatch.length === 0) return;
    await db.insert(address).values(addressBatch).onConflictDoNothing();
    addressBatch = [];
  }

  for await (const row of csvParser) {
    const lp = row.lp?.trim();
    const wkt = row.wkt;
    if (!lp || !wkt) continue;

    const placeId = `lp-${lp}`;

    // Insert place (one per linked point)
    await db.execute(sql`
      INSERT INTO place (id, type, geometry)
      VALUES (${placeId}, 'address', ST_GeomFromText(${wkt}, 28992))
      ON CONFLICT DO NOTHING
    `);
    placeCount++;

    // Collect address rows for each registry column
    for (const { col, source, date } of ADDR_COLS) {
      const addrId = row[col]?.trim();
      if (addrId) {
        const uri = `https://adamlink.nl/geo/address/${addrId}`;
        addressBatch.push({ id: uri, placeId, date, source });
        addressCount++;

        if (addressBatch.length >= BATCH_SIZE) {
          await flushAddresses();
        }
      }
    }

    if (placeCount % 1000 === 0) {
      process.stdout.write(`\r  ${placeCount} places, ${addressCount} addresses`);
    }
  }

  await flushAddresses();
  console.log(`\nDone: ${placeCount} places, ${addressCount} addresses`);
}
