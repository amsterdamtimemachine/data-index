/**
 * nwb-streets ingestion: the NWB fetcher writes ALL Amsterdam streets; this source
 * keeps only the ones Adamlink is missing. It drops streets whose bagOrl Adamlink
 * already covers (via owl:sameAs) and streets with no bagOrl, and it requires the
 * Adamlink straten TTL so it can never silently duplicate Adamlink.
 *
 * Fixture: 3 NWB streets — one Adamlink covers (0363…0001), one gap (0363…0002),
 * one with no bagOrl (a bridge). Only the gap should survive.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { resolve } from 'path';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';

const NWB = resolve(__dirname, 'fixtures/nwb-streets.geojson');
const ADAMLINK = resolve(__dirname, 'fixtures/adamlink-straten.ttl');

describe('nwb-streets ingestion (gap-fill dedup against Adamlink)', () => {
  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
    const { ingest } = await import('../etl/sources/nwb-streets');
    await ingest(NWB, { adamlinkStreets: ADAMLINK });
  });

  afterAll(async () => {
    await cleanTestDb();
    await teardownTestDb();
  });

  test('inserts only the street Adamlink is missing (drops the covered one + the no-bagOrl bridge)', async () => {
    const r = await db.execute<{ id: string; source: string }>(sql`SELECT id, source FROM place ORDER BY id`);
    expect(r.rows.map(x => x.id)).toEqual(['nwb-0363300000000002']);
    expect(r.rows[0].source).toBe('nwb');
  });

  test('the kept street has its geometry (MultiLineString in RD)', async () => {
    const r = await db.execute<{ gtype: string; srid: number }>(sql`
      SELECT GeometryType(geometry) as gtype, ST_SRID(geometry) as srid FROM place_geometry`);
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].gtype).toBe('MULTILINESTRING');
    expect(r.rows[0].srid).toBe(28992);
  });
});

describe('nwb-streets ingestion requires the Adamlink TTL', () => {
  test('throws without adamlinkStreets so it can never silently duplicate Adamlink', async () => {
    const { ingest } = await import('../etl/sources/nwb-streets');
    await expect(ingest(NWB)).rejects.toThrow(/Adamlink straten TTL/);
  });
});
