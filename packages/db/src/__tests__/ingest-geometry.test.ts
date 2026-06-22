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
    sql`SELECT p.id, p.type, GeometryType(g.geometry) as gtype FROM place p JOIN place_geometry g ON g.place_id = p.id ORDER BY p.id`
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

  test('districts ingest: wijk/buurt split + era windows (historical + CBS), unclassifiable skipped', async () => {
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

    // Era windows persisted to place_geometry.since/until: historical units from the TTL's
    // begin/end years, present-day CBS open-ended from CBS_VALID_SINCE.
<<<<<<< HEAD
    const eras = await db.execute<{ id: string; since: string | null; until: string | null }>(
      sql`SELECT place_id AS id, since::text AS since, until::text AS until FROM place_geometry ORDER BY place_id`
=======
    const eras = await db.execute<{ id: string; valid_since: string | null; valid_until: string | null }>(
      sql`SELECT place_id AS id, since::text AS valid_since, until::text AS valid_until FROM place_geometry ORDER BY place_id`
>>>>>>> 4bfc998 (move place geometry to its own 'place_geometry' table, rename preferred_label to display_name, rename place_name table to place_historical_name)
    );
    const era = new Map(eras.rows.map(r => [r.id, [r.since, r.until]]));
    expect(era.get(D('D1'))).toEqual(['1600-01-01', '1850-01-01']); // historical 1600 wijk
    expect(era.get(D('D2'))).toEqual(['1850-01-01', '1909-01-01']); // historical 1850 buurt
    expect(era.get(D('D3'))).toEqual(['1850-01-01', null]); // CBS wijk — extended back to fill the wijk gap
    expect(era.get(D('D4'))).toEqual(['1921-01-01', null]); // CBS buurt — extended back to fill the buurt gap
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
