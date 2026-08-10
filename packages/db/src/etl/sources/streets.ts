/**
 * Import street data from the Adamlink straten TTL.
 *
 * Creates one place per street that carries geometry (its current line) plus
 * place_historical_name entries for dated name variants. Streets WITHOUT geometry are
 * skipped here — the `nwb-streets` source backfills the ones that have a bagOrl crosswalk,
 * reusing the same parser so their names come through identically.
 *
 * Usage: bun run db:ingest -s streets -f <path-to-adamlinkstraten.ttl>
 */
import { readFileSync } from 'fs';
import { Parser } from 'n3';
import { insertPlaces, createNameWriter } from '../writers/place-writer';
import { parseAdamlinkStreets, insertStreetNames } from './adamlink-streets';

const BATCH_SIZE = 100;

interface StreetName {
  label: string;
  since: string | null;
  until: string | null;
}

interface Street {
  uri: string;
  prefLabel: string;
  wkt: string;
  names: StreetName[];
}

export async function ingest(filePath: string) {
  console.log(`Parsing ${filePath}...`);
  const all = parseAdamlinkStreets(readFileSync(filePath, 'utf8'));
  const streets = all.filter(s => s.wkt); // native streets = those with a line

  console.log(`Resolved ${streets.length} streets with geometry (${all.length - streets.length} skipped without geometry)`);

  // Insert place rows (geometry transformed from WGS84 to RD).
  const placeCount = await insertPlaces(
    streets.map(s => ({ id: s.uri, type: 'street', label: s.prefLabel, source: 'adamlink', url: s.uri, wkt: s.wkt! })),
    { sourceSrid: 4326, onConflict: 'replaceAll' }
  );
  console.log(`  ${placeCount} street places created`);

  const nameCount = await insertStreetNames(streets);
  console.log(`  ${nameCount} place_historical_name entries created`);
  console.log(`\nDone: ${placeCount} streets, ${nameCount} name variants`);
}
