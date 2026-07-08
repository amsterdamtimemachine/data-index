/**
 * nwb-streets ingestion. The NWB fetcher writes ALL Amsterdam streets; this source:
 *  - skips streets Adamlink already draws (dedup by bagOrl),
 *  - backfills streets Adamlink names but has no line for — keeping the Adamlink id/name/
 *    dated-names and borrowing the NWB line, recording place_geometry.source = 'nwb',
 *  - gap-fills streets absent from Adamlink as nwb-<bagOrl> places,
 *  - drops NWB segments with no bagOrl,
 *  - requires the Adamlink straten TTL (throws without it).
 *
 * Fixtures: covered-street/1 (has geometry) + backfill-street/2 (no geometry, has a dated
 * name), against NWB features 0001 (covered), 0002 (backfill), 0003 (gap), and a no-bagOrl bridge.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { resolve } from 'path';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';

const NWB = resolve(__dirname, 'fixtures/nwb-streets.geojson');
const ADAMLINK = resolve(__dirname, 'fixtures/adamlink-straten.ttl');
const BACKFILL_URI = 'https://adamlink.nl/geo/street/backfill-street/2';

describe('nwb-streets ingestion (dedup + backfill + gap-fill)', () => {
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

  test('keeps only the backfill + gap-fill streets (covered + no-bagOrl bridge dropped)', async () => {
    const r = await db.execute<{ id: string }>(sql`SELECT id FROM place ORDER BY id`);
    expect(r.rows.map(x => x.id).sort()).toEqual([BACKFILL_URI, 'nwb-0363300000000003'].sort());
  });

  test('backfills the geometry-less Adamlink street under its URI with the NWB line + provenance', async () => {
    const r = await db.execute<{ source: string; name: string; geom_source: string; geom_url: string; gtype: string }>(sql`
      SELECT p.source, p.name, g.source AS geom_source, g.url AS geom_url, GeometryType(g.geometry) AS gtype
      FROM place p JOIN place_geometry g ON g.place_id = p.id WHERE p.id = ${BACKFILL_URI}`);
    expect(r.rows.length).toBe(1);
    const row = r.rows[0];
    expect(row.source).toBe('adamlink');          // identity stays Adamlink
    expect(row.name).toBe('Backfill Street');       // Adamlink's prefLabel, not the NWB name
    expect(row.geom_source).toBe('nwb');            // geometry provenance is NWB
    expect(row.geom_url).toContain('bagviewer');
    expect(row.gtype).toBe('MULTILINESTRING');
  });

  test('the backfilled street carries its Adamlink dated name', async () => {
    const r = await db.execute<{ name: string }>(sql`
      SELECT name FROM place_historical_name WHERE place_id = ${BACKFILL_URI}`);
    expect(r.rows.map(x => x.name)).toContain('Oude Naam');
  });

  test('gap-fill street (absent from Adamlink) is an nwb place with no geometry override', async () => {
    const r = await db.execute<{ source: string; geom_source: string | null }>(sql`
      SELECT p.source, g.source AS geom_source
      FROM place p JOIN place_geometry g ON g.place_id = p.id WHERE p.id = 'nwb-0363300000000003'`);
    expect(r.rows[0].source).toBe('nwb');
    expect(r.rows[0].geom_source).toBeNull(); // provider matches the place, so no override
  });
});

describe('nwb-streets ingestion requires the Adamlink TTL', () => {
  test('throws without adamlinkStreets so it can never silently duplicate Adamlink', async () => {
    const { ingest } = await import('../etl/sources/nwb-streets');
    await expect(ingest(NWB)).rejects.toThrow(/Adamlink straten TTL/);
  });
});
