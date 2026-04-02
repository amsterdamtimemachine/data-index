/**
 * Enrich addresses with labels from Adamlink adressen CSV
 *
 * Updates the `address` table with human-readable names, then sets
 * `place.current_address` to the most recent address name per place.
 * Run after LPS ingestion (addresses must exist).
 *
 * Usage: bun run db:ingest -s adressen -f ../../data/20230920-adressen.csv
 */
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../client';
import { address } from '../../schema';

interface RawRow {
  adresid: string;
  streetname: string;
  nr: string;
  addition: string;
  buildingname: string;
}

function buildLabel(row: RawRow): string | null {
  const parts: string[] = [];
  if (row.streetname) parts.push(row.streetname.trim());
  if (row.nr) parts.push(row.nr.trim());
  if (row.addition) parts.push(row.addition.trim());
  if (parts.length === 0 && row.buildingname) return row.buildingname.trim();
  return parts.length > 0 ? parts.join(' ') : null;
}

export async function ingest(filePath: string) {
  console.log(`Reading ${filePath}...`);

  // Build adresid → label map, newer entries overwrite older ones
  const labels = new Map<string, string>();
  const csvParser = createReadStream(filePath).pipe(parse({ columns: true, relax_column_count: true }));

  for await (const row of csvParser as AsyncIterable<RawRow>) {
    if (!row.adresid) continue;
    const label = buildLabel(row);
    if (label) {
      labels.set(row.adresid, label);
    }
  }

  console.log(`Parsed ${labels.size} unique address labels`);
  console.log('Updating address names...');

  let updated = 0;

  for (const [adresid, name] of labels) {
    const uri = `https://adamlink.nl/geo/address/${adresid}`;
    await db.update(address).set({ name }).where(eq(address.id, uri));
    updated++;
    if (updated % 1000 === 0) {
      process.stdout.write(`\r  ${updated} updated...`);
    }
  }

  console.log(`\n${updated} address names updated`);

  // Set place.current_address to the most recent named address per place
  console.log('Updating place current addresses...');
  const result = await db.execute(sql`
    UPDATE place SET current_address = sub.name
    FROM (
      SELECT DISTINCT ON (place_id) place_id, name
      FROM address
      WHERE name IS NOT NULL
      ORDER BY place_id, date DESC
    ) sub
    WHERE place.id = sub.place_id
  `);
  console.log(`Done: ${result.rowCount} place current addresses updated`);
}
