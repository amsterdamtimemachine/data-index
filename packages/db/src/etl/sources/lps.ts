/**
 * Import place data from the LPS (Linked Point Set) TTL.
 *
 * Each `allp:` subject is one linked point carrying its geometry directly in
 * `geo:asWKT` (WGS84, reprojected to RD on insert — no blank nodes). We create one
 * `place` per LP (id = the Adamlink LP URI, type = address). Address *names* are not derived
 * here: the adressen TTL owns them, self-linking each observation to its LP via
 * `schema:geoContains` (the reverse of the `schema:geoWithin` address links carried
 * here, which we don't use). A `schema:geoWithin` to a BAG building (bagpand:) is the
 * LP's building, kept as place_geometry.building_id. Run LPS BEFORE adressen.
 *
 * Usage: bun run db:ingest -s lps -f <path-to-20230920-lps.ttl>
 */
import { readFileSync } from 'fs';
import { Parser } from 'n3';
import { insertPlaces, type PlaceInsert } from '../writers/place-writer';

const BAG_BUILDING_PREFIX = 'bag.basisregistraties.overheid.nl/bag/id/pand/';

export async function ingest(filePath: string) {
  console.log(`Parsing ${filePath}...`);
  const quads = new Parser().parse(readFileSync(filePath, 'utf8'));

  // Each LP point carries its geometry directly in geo:asWKT (no blank nodes); its
  // building, when the source gives one, is a geoWithin to a bagpand: URI.
  const buildings = new Map<string, string>();
  for (const q of quads) {
    if (!q.predicate.value.endsWith('geoWithin')) continue;
    const building = q.object.value.split(BAG_BUILDING_PREFIX)[1];
    if (building) buildings.set(q.subject.value, building);
  }
  const placeRows: PlaceInsert[] = [];
  for (const q of quads) {
    if (!q.predicate.value.endsWith('asWKT')) continue;
    const lp = q.subject.value.split('/geo/lp/')[1];
    if (!lp) continue;
    placeRows.push({
      id: q.subject.value, type: 'address', source: 'adamlink', url: q.subject.value,
      wkt: q.object.value, buildingId: buildings.get(q.subject.value) ?? null,
    });
  }

  // LPS geometry is WGS84 (EPSG:4326) and is reprojected to RD on insert.
  // Re-ingest refreshes geometry but preserves name, which the
  // adressen enrichment owns.
  console.log(`Inserting ${placeRows.length} places...`);
  const placeCount = await insertPlaces(placeRows, { sourceSrid: 4326, onConflict: 'replaceGeometry' });

  console.log(`\nDone: ${placeCount} places, ${buildings.size} with a building`);
}
