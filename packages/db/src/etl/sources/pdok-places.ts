/**
 * Ingest reference places from a PDOK ground-truth file produced by a fetcher
 * (see ../fetchers). One place per feature, geometry already in RD/28992.
 *
 * Accepts either a GeoJSON FeatureCollection (CBS areas) or NDJSON, one Feature
 * per line (BAG addresses). Each feature's properties carry the normalised
 * { id, type, name, source, url }; geometry is converted to WKT and inserted
 * as-is (no reprojection).
 *
 * Usage: bun run db:ingest -s pdok-places -f <path-to-fetched.geojson>
 */
import { readFileSync } from 'fs';
import type { Feature, FeatureCollection, Geometry, Position } from 'geojson';
import type { PlaceType, PlaceSource } from '@atm/shared';
import { insertPlaces, type PlaceInsert } from '../helpers';

interface PdokProps {
  id: string;
  type: PlaceType;
  name: string;
  source: PlaceSource;
  url: string | null;
}

type PdokFeature = Feature<Geometry, PdokProps>;

const pts = (cs: Position[]) => cs.map(([x, y]) => `${x} ${y}`).join(', ');

function toWkt(g: Geometry): string {
  switch (g.type) {
    case 'Point': return `POINT(${g.coordinates[0]} ${g.coordinates[1]})`;
    case 'MultiPoint': return `MULTIPOINT(${pts(g.coordinates)})`;
    case 'LineString': return `LINESTRING(${pts(g.coordinates)})`;
    case 'MultiLineString': return `MULTILINESTRING(${g.coordinates.map(l => `(${pts(l)})`).join(', ')})`;
    case 'Polygon': return `POLYGON(${g.coordinates.map(r => `(${pts(r)})`).join(', ')})`;
    case 'MultiPolygon': return `MULTIPOLYGON(${g.coordinates.map(p => `(${p.map(r => `(${pts(r)})`).join(', ')})`).join(', ')})`;
    default: throw new Error(`Unsupported geometry type: ${g.type}`);
  }
}

export function readFeatures(raw: string): PdokFeature[] {
  try {
    const doc = JSON.parse(raw) as FeatureCollection<Geometry, PdokProps> | PdokFeature;
    return doc.type === 'FeatureCollection' ? doc.features : [doc];
  } catch {
    return raw.split('\n').filter(line => line.trim()).map(line => JSON.parse(line) as PdokFeature);
  }
}

// A fetched feature's normalised properties → a place row. Shared with the nwb-streets
// ingest, which filters the features first and then maps the survivors.
export const pdokRow = (f: PdokFeature): PlaceInsert => ({
  id: f.properties.id,
  type: f.properties.type,
  label: f.properties.name,
  wkt: toWkt(f.geometry),
  source: f.properties.source,
  url: f.properties.url,
});

export async function ingest(filePath: string) {
  console.log(`Reading ${filePath}...`);
  const features = readFeatures(readFileSync(filePath, 'utf8'));

  const rows: PlaceInsert[] = features.map(pdokRow);

  const byType = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.type] = (acc[r.type] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`Inserting ${rows.length} places: ${Object.entries(byType).map(([t, n]) => `${n} ${t}`).join(', ')}`);

  const inserted = await insertPlaces(rows, { sourceSrid: 28992, onConflict: 'replaceAll' });
  console.log(`\nDone: ${inserted} places`);
}
