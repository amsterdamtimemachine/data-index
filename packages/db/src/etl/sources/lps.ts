/**
 * Import place data from LPS (Linked Point Set) CSV
 *
 * Creates one place per linked point (lp) with geometry, and one place_name
 * row per historical address ID linking to that place.
 *
 * Usage: bun run db:ingest -s lps -f <path-to-20230920-lps.csv>
 */
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import type { NewPlaceName } from '../../schema';
import { insertPlaces, createNameWriter, adamlinkAddressUri, type PlaceInsert } from '../helpers';

const ADDR_COLS: { col: string; source: string; date: string }[] = [
  { col: 'pw-1943', source: 'pw-1943', date: '1943-01-01' },
  { col: 'pw-1909', source: 'pw-1909', date: '1909-01-01' },
  { col: 'obelt-1920', source: 'obelt-1920', date: '1920-01-01' },
  { col: 'loman-1976', source: 'loman-1976', date: '1976-01-01' },
  { col: 'bevolkingsregister-1870', source: 'bevolkingsregister-1870', date: '1870-01-01' },
  { col: 'wijken-1853', source: 'wijken-1853', date: '1853-01-01' },
  { col: 'percelen-1832', source: 'percelen-1832', date: '1832-01-01' },
];

export async function ingest(filePath: string) {
  console.log(`Parsing ${filePath}...`);
  const csvParser = createReadStream(filePath).pipe(parse({ columns: true }));

  // Buffer rows, then insert places before names (place_name has an FK to place).
  const placeRows: PlaceInsert[] = [];
  const nameRows: NewPlaceName[] = [];

  for await (const row of csvParser) {
    const lp = row.lp?.trim();
    const wkt = row.wkt;
    if (!lp || !wkt) continue;

    const placeId = `lp-${lp}`;
    placeRows.push({ id: placeId, type: 'address', wkt });

    for (const { col, source, date } of ADDR_COLS) {
      const addrId = row[col]?.trim();
      if (addrId) {
        nameRows.push({ id: adamlinkAddressUri(addrId), placeId, since: date, source });
      }
    }
  }

  // LPS geometry is already RD (28992). Re-ingest refreshes geometry but preserves
  // preferred_label, which the later adressen enrichment owns.
  console.log(`Inserting ${placeRows.length} places...`);
  const placeCount = await insertPlaces(placeRows, { sourceSrid: 28992, onConflict: 'replaceGeometry' });

  console.log(`Inserting ${nameRows.length} place names...`);
  const names = createNameWriter();
  for (const name of nameRows) {
    names.add(name);
    await names.flushIfFull();
  }
  await names.flush();

  console.log(`\nDone: ${placeCount} places, ${nameRows.length} addresses`);
}
