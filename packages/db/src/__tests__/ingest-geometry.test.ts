/**
 * Ingestion → geometry-type coverage for the line/polygon backbone sources.
 * Proves the TTL parsers + insertPlaces produce places of the right `type` and the
 * right PostGIS geometry type (LINESTRING for streets; POLYGON / MULTIPOLYGON for
 * districts), and that non-historical (CBS) districts are skipped. Uses small TTL
 * fixtures in the Adamlink shape (WGS84 WKT, transformed to RD on insert).
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

  test('districts ingest: historical POLYGON + MULTIPOLYGON kept, CBS skipped', async () => {
    await cleanTestDb();
    const { ingest } = await import('../etl/sources/districts');
    await ingest(resolve(__dirname, 'fixtures/districts.ttl'));

    const rows = await placeGeoms();
    expect(rows.length).toBe(2); // D3 (CBS, beginYear 2020) skipped
    expect(rows.every(r => r.type === 'neighbourhood')).toBe(true);

    const byId = new Map(rows.map(r => [r.id, r.gtype]));
    expect(byId.get('https://adamlink.nl/geo/district/D1')).toBe('POLYGON');
    expect(byId.get('https://adamlink.nl/geo/district/D2')).toBe('MULTIPOLYGON');
    expect([...byId.keys()].some(id => id.endsWith('/D3'))).toBe(false);
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
