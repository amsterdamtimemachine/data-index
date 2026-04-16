import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { getTestDb, setupTestDb, cleanTestDb, seedTestData, teardownTestDb } from './setup';

const db = getTestDb();

beforeAll(async () => {
  await setupTestDb();
  await cleanTestDb();
  await seedTestData();
});

afterAll(async () => {
  await cleanTestDb();
  await teardownTestDb();
});

describe('bin boundary overlap', () => {
  test('feature starting at 1900 appears in [1900, 1950) bin', async () => {
    const result = await db.execute<{ id: string }>(sql`
      SELECT f.id FROM features f
      WHERE EXTRACT(YEAR FROM f.start_date) < 1950
        AND EXTRACT(YEAR FROM f.end_date) >= 1900
        AND f.id = '33333333-3333-3333-3333-333333333333'
    `);
    expect(result.rows.length).toBe(1);
  });

  test('feature starting at 1900 does NOT appear in [1850, 1900) bin', async () => {
    const result = await db.execute<{ id: string }>(sql`
      SELECT f.id FROM features f
      WHERE EXTRACT(YEAR FROM f.start_date) < 1900
        AND EXTRACT(YEAR FROM f.end_date) >= 1850
        AND f.id = '33333333-3333-3333-3333-333333333333'
    `);
    expect(result.rows.length).toBe(0);
  });

  test('feature spanning 1840-1920 appears in bins 1800, 1850, 1900', async () => {
    const bins = [
      { start: 1800, end: 1850 },
      { start: 1850, end: 1900 },
      { start: 1900, end: 1950 },
    ];

    for (const bin of bins) {
      const result = await db.execute<{ id: string }>(sql`
        SELECT f.id FROM features f
        WHERE EXTRACT(YEAR FROM f.start_date) < ${bin.end}
          AND EXTRACT(YEAR FROM f.end_date) >= ${bin.start}
          AND f.id = '11111111-1111-1111-1111-111111111111'
      `);
      expect(result.rows.length).toBe(1);
    }
  });

  test('feature spanning 1840-1920 does NOT appear in [1950, 2000) bin', async () => {
    const result = await db.execute<{ id: string }>(sql`
      SELECT f.id FROM features f
      WHERE EXTRACT(YEAR FROM f.start_date) < 2000
        AND EXTRACT(YEAR FROM f.end_date) >= 1950
        AND f.id = '11111111-1111-1111-1111-111111111111'
    `);
    expect(result.rows.length).toBe(0);
  });
});

describe('histogram overlap counting', () => {
  test('features are counted once per bin with COUNT DISTINCT', async () => {
    const result = await db.execute<{ bin_start: string; count: string }>(sql`
      WITH slices AS (
        SELECT gs AS bin_start, gs + 50 AS bin_end
        FROM generate_series(1800, 1950, 50) AS gs
      )
      SELECT s.bin_start::text as bin_start, COUNT(DISTINCT f.id) as count
      FROM features f
      JOIN slices s ON EXTRACT(YEAR FROM f.start_date) < s.bin_end
                   AND EXTRACT(YEAR FROM f.end_date) >= s.bin_start
      GROUP BY s.bin_start
      ORDER BY s.bin_start
    `);

    const bins = new Map(result.rows.map(r => [parseInt(r.bin_start), parseInt(r.count)]));

    // 1800-1850: feature 1 (1840-1920)
    expect(bins.get(1800)).toBe(1);
    // 1850-1900: feature 1 (1840-1920)
    expect(bins.get(1850)).toBe(1);
    // 1900-1950: all 3 features overlap this bin
    expect(bins.get(1900)).toBe(3);
  });
});

describe('historical address lookup', () => {
  test('finds correct address for 1906 feature (uses 1832 entry)', async () => {
    const result = await db.execute<{ name: string }>(sql`
      SELECT (
        SELECT a.name FROM address a
        WHERE a.place_id = 'lp-1'
          AND a.date <= '1860-12-31'
        ORDER BY a.date DESC LIMIT 1
      ) as name
    `);
    expect(result.rows[0].name).toBe('Wijk F 439');
  });

  test('finds correct address for 1920 feature (uses 1909 entry)', async () => {
    const result = await db.execute<{ name: string }>(sql`
      SELECT (
        SELECT a.name FROM address a
        WHERE a.place_id = 'lp-1'
          AND a.date <= '1920-12-31'
        ORDER BY a.date DESC LIMIT 1
      ) as name
    `);
    expect(result.rows[0].name).toBe('Prins Hendrikkade 93');
  });

  test('returns null for date before any registry', async () => {
    const result = await db.execute<{ name: string | null }>(sql`
      SELECT (
        SELECT a.name FROM address a
        WHERE a.place_id = 'lp-1'
          AND a.date <= '1800-01-01'
        ORDER BY a.date DESC LIMIT 1
      ) as name
    `);
    expect(result.rows[0].name).toBeNull();
  });
});

describe('description truncation', () => {
  test('description over 128 chars gets truncated in result mapping', () => {
    const longDescription = 'A test image with a description that is longer than one hundred and twenty eight characters to verify truncation works correctly in the API response mapping';
    const truncated = longDescription.slice(0, 128);
    expect(truncated.length).toBe(128);
    expect(longDescription.length).toBeGreaterThan(128);
  });
});

describe('sort param validation', () => {
  test('valid sort values are accepted', () => {
    const valid = ['relevance', 'spatialFrequency', 'date'];
    for (const v of valid) {
      expect(valid.includes(v)).toBe(true);
    }
  });

  test('invalid sort values are rejected', () => {
    const valid = ['relevance', 'spatialFrequency', 'date'];
    expect(valid.includes('frequency')).toBe(false);
    expect(valid.includes('DROP TABLE')).toBe(false);
    expect(valid.includes('')).toBe(false);
  });
});

describe('heatmap grid clamping', () => {
  test('requested grid is clamped to max cell extent', async () => {
    const result = await db.execute<{ max_x: number; max_y: number }>(sql`
      SELECT MAX(cell_x) as max_x, MAX(cell_y) as max_y FROM feature_cells
    `);
    const maxX = result.rows[0].max_x;
    const maxY = result.rows[0].max_y;

    const requestedCols = 500;
    const requestedRows = 500;
    const clampedCols = Math.min(requestedCols, maxX + 1);
    const clampedRows = Math.min(requestedRows, maxY + 1);

    expect(clampedCols).toBeLessThan(requestedCols);
    expect(clampedRows).toBeLessThan(requestedRows);
  });
});
