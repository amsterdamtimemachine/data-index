/**
 * Import place data from the LPS (Linked Point Set) TTL.
 *
 * Each `allp:` subject is one linked point carrying its geometry directly in
 * `geo:asWKT` (WGS84, reprojected to RD on insert — no blank nodes). We create one
 * `place` per LP (id = `lp-<N>`, type = address). Address *names* are not derived
 * here: the adressen TTL owns them, self-linking each observation to its LP via
 * `schema:geoContains` (the reverse of the `schema:geoWithin` links carried here,
 * which we don't use). Run LPS BEFORE adressen.
 *
 * Usage: bun run db:ingest -s lps -f <path-to-20230920-lps.ttl>
 */
import { readFileSync } from 'fs';
import { Parser } from 'n3';
import { insertPlaces, type PlaceInsert } from '../helpers';

export async function ingest(filePath: string) {
  console.log(`Parsing ${filePath}...`);
  const quads = new Parser().parse(readFileSync(filePath, 'utf8'));

  // Each LP point carries its geometry directly in geo:asWKT, so a single pass
  // over the asWKT quads is enough (no subject grouping / blank-node chasing).
  const placeRows: PlaceInsert[] = [];
  for (const q of quads) {
    if (!q.predicate.value.endsWith('asWKT')) continue;
    const lp = q.subject.value.split('/geo/lp/')[1];
    if (!lp) continue;
    placeRows.push({ id: `lp-${lp}`, type: 'address', wkt: q.object.value });
  }

  // LPS geometry is WGS84 (EPSG:4326) and is reprojected to RD on insert.
  // Re-ingest refreshes geometry but preserves display_name, which the
  // adressen enrichment owns.
  console.log(`Inserting ${placeRows.length} places...`);
  const placeCount = await insertPlaces(placeRows, { sourceSrid: 4326, onConflict: 'replaceGeometry' });

  console.log(`\nDone: ${placeCount} places`);
}
