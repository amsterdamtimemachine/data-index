/**
 * Import Adamlink buildings from the gebouwen TTL: one place per building that has
 * geometry, a footprint for a standing building (from BAG) or a point for a vanished
 * one, with its build and demolition years as its lifespan, its names as a street's,
 * and its BAG building id. Adamlink's list reaches into neighbouring municipalities
 * (metro stations, polder mills); only buildings within the territory are kept, as
 * the municipality boundary from db:fetch draws it.
 *
 * Usage: bun run db:ingest -s buildings -f <path-to-adamlinkgebouwen.ttl> -m <data-dir>/municipality.geojson
 */
import { readFileSync } from 'fs';
import { sql } from 'drizzle-orm';
import { db } from '../../client';
import { insertPlaces } from '../writers/place-writer';
import { parseAdamlinkPlaces, insertAdamlinkNames, existenceWindow, type AdamlinkPlace } from './adamlink-places';

// BAG gives 1005 for a build year it does not know; one record says 9950
const UNKNOWN_YEARS = new Set(['1005', '9950']);

function knownYear(year: string | null): string | null {
  if (!year || UNKNOWN_YEARS.has(year)) {
    return null;
  }
  return year;
}

type Boundary = { type: 'FeatureCollection'; features: { geometry: object }[] };

// the buildings whose geometry touches a municipality polygon; the boundary file is
// in RD, as PDOK writes it
async function withinMunicipality(buildings: AdamlinkPlace[], boundaryPath: string): Promise<Set<string>> {
  const boundary = JSON.parse(readFileSync(boundaryPath, 'utf8')) as Boundary;
  if (boundary.features.length === 0) throw new Error(`${boundaryPath} holds no municipality`);
  const polygons = boundary.features.map(f => sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(f.geometry)}), 28992)`);
  const rows = await db.execute<{ uri: string }>(sql`
    SELECT v.uri
    FROM (VALUES ${sql.join(buildings.map(b => sql`(${b.uri}::text, ${b.wkt}::text)`), sql`, `)}) AS v(uri, wkt)
    WHERE EXISTS (
      SELECT 1 FROM unnest(ARRAY[${sql.join(polygons, sql`, `)}]) AS m(geom)
      WHERE ST_Intersects(m.geom, ST_Transform(ST_GeomFromText(v.wkt, 4326), 28992)))`);
  return new Set(rows.rows.map(r => r.uri));
}

export async function ingest(filePath: string, opts: { municipality?: string } = {}) {
  if (!opts.municipality) {
    throw new Error('the buildings source needs the municipality boundary: -m <data-dir>/municipality.geojson (from db:fetch -s municipality)');
  }
  console.log(`Parsing ${filePath}...`);
  const all = parseAdamlinkPlaces(readFileSync(filePath, 'utf8'), 'building');
  const located = all.filter(b => b.wkt);
  const scope = await withinMunicipality(located, opts.municipality);
  const buildings = located.filter(b => scope.has(b.uri));
  console.log(`Resolved ${buildings.length} buildings (${all.length - located.length} skipped without geometry, ${located.length - buildings.length} outside the municipality)`);

  const placeCount = await insertPlaces(
    buildings.map(b => ({
      id: b.uri, type: 'building', label: b.prefLabel, source: 'adamlink', url: b.uri, wkt: b.wkt!,
      ...existenceWindow({ since: knownYear(b.since), until: knownYear(b.until) }),
      buildingId: b.bagPand,
    })),
    { sourceSrid: 4326, onConflict: 'replaceAll' }
  );
  const nameCount = await insertAdamlinkNames(buildings, 'adamlink-gebouwen');
  console.log(`\nDone: ${placeCount} buildings, ${nameCount} name variants`);
}
