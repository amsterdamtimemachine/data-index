/**
 * Delpher ingestion (previously untested): unlike the Adamlink-URI sources, Delpher
 * matches each article's POINT to the *nearest existing Adamlink place* (source='adamlink')
 * within a threshold (ST_DWithin 5m) and parses a PostgreSQL date range into start/end —
 * it targets the historical LP layer, not current BAG points. Fixture has one point on
 * top of a seeded place (matched) and one far away (skipped).
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { resolve } from 'path';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';

describe('delpher ingestion (nearest-place match + period parse)', () => {
  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
    // One place exactly under the first article's point; nothing near the second.
    await db.execute(sql`INSERT INTO place (id, type, source) VALUES ('delpher-place', 'address', 'adamlink')`);
    await db.execute(sql`
      INSERT INTO place_geometry (place_id, geometry)
      VALUES ('delpher-place', ST_Transform(ST_GeomFromText('POINT(4.9 52.37)', 4326), 28992))
    `);
    const { ingest } = await import('../etl/sources/delpher');
    await ingest(resolve(__dirname, 'fixtures/delpher.csv'));
  });

  afterAll(async () => {
    await cleanTestDb();
    await teardownTestDb();
  });

  test('creates a text feature for the matched article and skips the far one', async () => {
    const r = await db.execute<{ count: string }>(sql`SELECT COUNT(*) AS count FROM features`);
    expect(parseInt(r.rows[0].count)).toBe(1); // a2 (5.25, 52.45) is > 5m from any place
  });

  test('the matched feature is a Delpher text record with the parsed date range', async () => {
    const r = await db.execute<{ record_type: string; dataset_id: string; url: string; start: string; end: string }>(sql`
      SELECT record_type, dataset_id, url, start_date::text AS start, end_date::text AS end FROM features
    `);
    const f = r.rows[0];
    expect(f.record_type).toBe('text');
    expect(f.dataset_id).toBe('delpher');
    expect(f.url).toBe('https://www.delpher.nl/article/a1');
    expect(f.start).toBe('1925-01-01');
    expect(f.end).toBe('1925-12-31');
  });

  test('the matched feature links to the nearest place', async () => {
    const r = await db.execute<{ place_id: string }>(sql`SELECT place_id FROM feature_to_place`);
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].place_id).toBe('delpher-place');
  });
});
