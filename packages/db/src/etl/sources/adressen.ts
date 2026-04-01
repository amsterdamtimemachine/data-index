/**
 * Enrich places with address labels from Adamlink adressen CSV
 *
 * Reads the adressen CSV and updates the `place` table with human-readable
 * labels built from streetname + house number + addition.
 * Run after LPS ingestion (places must exist).
 *
 * Usage: bun run db:ingest -s adressen -f ../../data/20230920-adressen.csv
 */
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { eq } from 'drizzle-orm';
import { db } from '../../client';
import { place } from '../../schema';

interface RawRow {
  adresid: string;
  streetname: string;
  nr: string;
  addition: string;
  buildingname: string;
}

function buildLabel(row: RawRow): string | null {
  // Require a street name for a useful label — bare numbers aren't meaningful
  if (!row.streetname?.trim()) return row.buildingname?.trim() || null;
  const parts = [row.streetname.trim()];
  if (row.nr) parts.push(row.nr.trim());
  if (row.addition) parts.push(row.addition.trim());
  return parts.join(' ');
}

export async function ingest(filePath: string) {
  console.log(`Reading ${filePath}...`);

  // Build adresid → label map, newer entries overwrite older ones (most recent name wins)
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
  console.log('Updating place labels...');

  let updated = 0;

  for (const [adresid, label] of labels) {
    const uri = `https://adamlink.nl/geo/address/${adresid}`;
    await db.update(place).set({ label }).where(eq(place.id, uri));
    updated++;
    if (updated % 1000 === 0) {
      process.stdout.write(`\r  ${updated} updated...`);
    }
  }

  console.log(`\nDone: ${updated} place labels updated`);
}
