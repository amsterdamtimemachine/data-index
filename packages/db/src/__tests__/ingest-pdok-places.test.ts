/**
 * pdok-places ingestion (CBS/NWB/BAG ground-truth files → place + place_geometry).
 * Covers both file formats — a GeoJSON FeatureCollection (areas/streets) and NDJSON
 * (addresses, streamed) — the geometry converter across MultiPolygon/MultiLineString/
 * Point, and that source/url land on the place row. Geometry is already RD (28992).
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { resolve } from 'path';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';

type PlaceRow = { id: string; type: string; name: string; source: string; url: string | null };
type GeomRow = { id: string; gtype: string; srid: number };

describe('pdok-places ingestion (GeoJSON + NDJSON → place)', () => {
  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
    const { ingest } = await import('../etl/sources/pdok-places');
    await ingest(resolve(__dirname, 'fixtures/pdok-places.geojson')); // FeatureCollection
    await ingest(resolve(__dirname, 'fixtures/pdok-places.ndjson'));  // NDJSON stream
  });
  afterAll(teardownTestDb);

  test('ingests both formats — 2 from GeoJSON + 2 from NDJSON', async () => {
    const r = await db.execute<{ count: string }>(sql`SELECT count(*) as count FROM place`);
    expect(parseInt(r.rows[0].count)).toBe(4);
  });

  test('carries type / source / url onto the place row', async () => {
    const r = await db.execute<PlaceRow>(sql`SELECT id, type, name, source, url FROM place ORDER BY id`);
    const byId = Object.fromEntries(r.rows.map(p => [p.id, p]));

    expect(byId['cbs-BU0457TEST']).toMatchObject({ type: 'neighbourhood', name: 'Testbuurt', source: 'cbs', url: null });
    expect(byId['nwb-0363300099999999']).toMatchObject({ type: 'street', name: 'Teststraat', source: 'nwb' });
    expect(byId['nwb-0363300099999999'].url).toContain('bagviewer');
    expect(byId['bag-0363010000099998']).toMatchObject({ type: 'address', name: 'Teststraat 1', source: 'bag' });
    expect(byId['bag-0363010000099998'].url).toContain('verblijfsobject');
  });

  test('stores geometry in RD (28992) with the right type per feature', async () => {
    const r = await db.execute<GeomRow>(sql`
      SELECT p.id, GeometryType(g.geometry) as gtype, ST_SRID(g.geometry) as srid
      FROM place p JOIN place_geometry g ON g.place_id = p.id ORDER BY p.id`);
    const byId = Object.fromEntries(r.rows.map(x => [x.id, x]));

    expect(r.rows.every(x => x.srid === 28992)).toBe(true);
    expect(byId['cbs-BU0457TEST'].gtype).toBe('MULTIPOLYGON');
    expect(byId['nwb-0363300099999999'].gtype).toBe('MULTILINESTRING');
    expect(byId['bag-0363010000099998'].gtype).toBe('POINT');
    expect(byId['bag-0457010000099997'].gtype).toBe('POINT');
  });

  test('every place has a matching place_geometry row (no dangling)', async () => {
    const r = await db.execute<{ count: string }>(sql`
      SELECT count(*) as count FROM place p WHERE NOT EXISTS (
        SELECT 1 FROM place_geometry g WHERE g.place_id = p.id)`);
    expect(parseInt(r.rows[0].count)).toBe(0);
  });
});
