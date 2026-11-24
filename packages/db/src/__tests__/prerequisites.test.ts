/**
 * A source run out of order stops before writing, naming what to ingest first: the
 * adressen names the LPS points, and a feature dataset needs places to link to.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { resolve } from 'path';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';

describe('ingest prerequisites', () => {
  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
  });

  afterAll(async () => {
    await cleanTestDb();
    await teardownTestDb();
  });

  test('adressen without the LPS points', async () => {
    const { ingest } = await import('../etl/sources/adressen');
    await expect(ingest(resolve(__dirname, 'fixtures/adressen.ttl'))).rejects.toThrow(/ingest lps first/);
    const r = await db.execute<{ count: string }>(sql`SELECT COUNT(*) AS count FROM place_historical_name`);
    expect(r.rows[0].count).toBe('0');
  });

  test('a feature dataset on an index without places', async () => {
    const { ingest } = await import('../etl/sources/amsterdam-diaries');
    await expect(ingest(resolve(__dirname, 'fixtures/amsterdam-diaries.jsonl'))).rejects.toThrow(/place layers first/);
    const r = await db.execute<{ count: string }>(sql`SELECT COUNT(*) AS count FROM features`);
    expect(r.rows[0].count).toBe('0');
  });
});
