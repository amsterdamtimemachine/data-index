/**
 * Import place data from LPS (Linked Point Set) CSV
 *
 * Creates one place per linked point (lp) with its RD geometry. Address *names*
 * are no longer derived here: the adressen TTL owns them — each observation
 * self-links to its LP via `schema:geoContains`, so LPS only lays down the points
 * that the place_name FK (and the adressen enrichment) then reference. Run LPS
 * BEFORE adressen.
 *
 * Usage: bun run db:ingest -s lps -f <path-to-20230920-lps.csv>
 */
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { insertPlaces, type PlaceInsert } from '../helpers';

export async function ingest(filePath: string) {
  console.log(`Parsing ${filePath}...`);
  const csvParser = createReadStream(filePath).pipe(parse({ columns: true }));

  const placeRows: PlaceInsert[] = [];
  for await (const row of csvParser) {
    const lp = row.lp?.trim();
    const wkt = row.wkt;
    if (!lp || !wkt) continue;
    placeRows.push({ id: `lp-${lp}`, type: 'address', wkt });
  }

  // LPS geometry is already RD (28992). Re-ingest refreshes geometry but preserves
  // preferred_label, which the adressen enrichment owns.
  console.log(`Inserting ${placeRows.length} places...`);
  const placeCount = await insertPlaces(placeRows, { sourceSrid: 28992, onConflict: 'replaceGeometry' });

  console.log(`\nDone: ${placeCount} places`);
}
