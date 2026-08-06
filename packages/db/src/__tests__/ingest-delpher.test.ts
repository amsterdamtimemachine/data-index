/**
 * Delpher ingestion: unlike the Adamlink-URI sources, Delpher carries a WGS84 POINT and a
 * PostgreSQL date range. Each point resolves through the WKT cascade (inferByPoint) —
 * nearest place per source within the per-type caps, era-ranked by the article's date —
 * and the range parser maps a half-open ')' end to the inclusive last day, keeps an
 * inclusive ']' end as-is, and skips a degenerate range. Fixture: one matched point, one
 * far (cap-miss, skipped), one ']'-closer (matched), one degenerate range (skipped).
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { resolve } from 'path';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';

describe('delpher ingestion (WKT cascade match + period parse)', () => {
  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
    // One place exactly under the first article's point; nothing near the second.
    // place.source FKs to organisations, so seed the Adamlink provider first.
    await db.execute(sql`INSERT INTO organisations (id, label) VALUES ('adamlink', 'Adamlink')`);
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

  test('creates a feature only for the resolvable, well-dated articles', async () => {
    const r = await db.execute<{ count: string }>(sql`SELECT COUNT(*) AS count FROM features`);
    // a1 + a3 matched; a2 is far (cap-miss) and a4 is a degenerate range (undated) → both skipped
    expect(parseInt(r.rows[0].count)).toBe(2);
  });

  test('the matched feature is a Delpher text record with the parsed date range', async () => {
    const r = await db.execute<{ record_type: string; dataset_id: string; url: string; start: string; end: string }>(sql`
      SELECT record_type, dataset_id, url, start_date::text AS start, end_date::text AS end
      FROM features WHERE url = 'https://www.delpher.nl/article/a1'
    `);
    const f = r.rows[0];
    expect(f.record_type).toBe('text');
    expect(f.dataset_id).toBe('delpher');
    expect(f.start).toBe('1925-01-01');
    expect(f.end).toBe('1925-12-31'); // period [1925-01-01,1926-01-01) is half-open → inclusive last day
  });

  test('an inclusive "]" closer keeps the end day as-is (no −1 shift)', async () => {
    const r = await db.execute<{ start: string; end: string }>(sql`
      SELECT start_date::text AS start, end_date::text AS end
      FROM features WHERE url = 'https://www.delpher.nl/article/a3'
    `);
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].start).toBe('1930-01-01');
    expect(r.rows[0].end).toBe('1930-12-31'); // "]" is inclusive → stays, unlike ")" which shifts −1 day
  });

  test('a degenerate range [d,d) collapses after the −1 shift → the article is skipped', async () => {
    const r = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*) AS count FROM features WHERE url = 'https://www.delpher.nl/article/a4'
    `);
    expect(parseInt(r.rows[0].count)).toBe(0);
  });

  test('the matched articles link to the place under their point', async () => {
    const r = await db.execute<{ place_id: string }>(sql`SELECT place_id FROM feature_to_place`);
    expect(r.rows.length).toBe(2); // a1 and a3, both over delpher-place
    expect(r.rows.every((row) => row.place_id === 'delpher-place')).toBe(true);
  });
});
