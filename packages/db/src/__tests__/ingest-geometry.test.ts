/**
 * Ingestion → geometry-type coverage for the line/polygon backbone sources.
 * Proves the TTL parsers + insertPlaces produce places of the right `type` and the
 * right PostGIS geometry type (LINESTRING for streets; POLYGON / MULTIPOLYGON for
 * districts), that wijken vs buurten are split onto district vs neighbourhood
 * (historical by begin year, present-day by CBS code), and that unclassifiable
 * entries are skipped. Uses small TTL fixtures in the Adamlink shape (WGS84 WKT,
 * transformed to RD on insert).
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { resolve } from 'path';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';

type PlaceGeomRow = { id: string; type: string; gtype: string };

async function placeGeoms(): Promise<PlaceGeomRow[]> {
  const r = await db.execute<PlaceGeomRow>(
    sql`SELECT id, type, GeometryType(geometry) as gtype FROM place ORDER BY id`
  );
  return r.rows;
}

describe('line/polygon ingestion produces the right geometry types', () => {
  beforeAll(async () => {
    await setupTestDb();
  });
  afterAll(async () => {
    await cleanTestDb();
    await teardownTestDb();
  });

  test('districts ingest: wijken→district, buurten→neighbourhood (historical + CBS), unclassifiable skipped', async () => {
    await cleanTestDb();
    const { ingest } = await import('../etl/sources/neighbourhoods-and-districts');
    await ingest(resolve(__dirname, 'fixtures/districts.ttl'));

    const rows = await placeGeoms();
    expect(rows.length).toBe(4); // D5 (no CBS code, non-historical begin year) skipped

    const D = (n: string) => `https://adamlink.nl/geo/district/${n}`;
    const type = new Map(rows.map(r => [r.id, r.type]));
    const gtype = new Map(rows.map(r => [r.id, r.gtype]));

    // Granularity split: wijk → district, buurt → neighbourhood.
    expect(type.get(D('D1'))).toBe('district');      // historical 1600 wijk
    expect(type.get(D('D2'))).toBe('neighbourhood'); // historical 1850 buurt
    expect(type.get(D('D3'))).toBe('district');      // present-day CBS WK…
    expect(type.get(D('D4'))).toBe('neighbourhood'); // present-day CBS BU…

    // Geometry type preserved through the WGS84→RD transform.
    expect(gtype.get(D('D1'))).toBe('POLYGON');
    expect(gtype.get(D('D2'))).toBe('MULTIPOLYGON');

    // Unclassifiable entry dropped.
    expect([...type.keys()].some(id => id.endsWith('/D5'))).toBe(false);
  });

  test('streets ingest: produces a street place with LINESTRING geometry', async () => {
    await cleanTestDb();
    const { ingest } = await import('../etl/sources/streets');
    await ingest(resolve(__dirname, 'fixtures/streets.ttl'));

    const rows = await placeGeoms();
    expect(rows.length).toBe(1);
    expect(rows[0].type).toBe('street');
    expect(rows[0].gtype).toBe('LINESTRING');
  });
});
